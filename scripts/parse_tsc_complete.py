import re
import json
import sys

def strip_bidi(text):
    return re.sub(r'[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c\ufeff]', '', text)

UNIT_CODES = {'KGM', 'KG', 'NMB', 'LTR', 'MTR', 'MTK', 'MTQ', 'M2', 'M3', 'SET', 'PCE', 'PRS', 'TNE', 'GRM'}
SKIP_CST = UNIT_CODES | {'TSC', 'SPP', 'PDF', 'USB', 'LED', 'LCD', 'GPS', 'SIM', 'RAM', 'DVD', 'ABS', 'CNG', 'LPG', 'SUV', 'EUR', 'USD', 'IQD', 'USE'}

num_re = re.compile(r'(\d[\d,]*\.\d{3})')

def get_context(lines, idx, before=3, after=3):
    start = max(0, idx - before)
    end = min(len(lines), idx + after + 1)
    return ' '.join(lines[start:end])

def find_cst(text):
    for m in re.finditer(r'\b([A-Z][A-Z0-9]{2,3})\b', text):
        c = m.group(1)
        if c not in SKIP_CST and len(c) >= 3:
            return c
    for m in re.finditer(r'([A-Z][A-Z0-9]{2,3})(?=[\u0600-\u06FF])', text):
        c = m.group(1)
        if c not in SKIP_CST and len(c) >= 3:
            return c
    return None

def extract_values(context):
    nums = num_re.findall(context)
    float_nums = []
    for n in nums:
        try:
            v = float(n.replace(',', ''))
            if v < 1000000:
                float_nums.append(v)
        except:
            pass

    if len(float_nums) >= 3:
        for k in range(len(float_nums) - 2):
            a, b, c = float_nums[k], float_nums[k+1], float_nums[k+2]
            if a <= b and a <= c <= b:
                return a, b, c
        return float_nums[0], float_nums[1], float_nums[2]
    elif len(float_nums) == 2:
        return float_nums[0], float_nums[1], None
    elif len(float_nums) == 1:
        return None, None, float_nums[0]
    return None, None, None

def extract_unit(context):
    m = re.search(r'\b(' + '|'.join(UNIT_CODES) + r')\b', context)
    return m.group(1) if m else None

def extract_description(lines, idx, search_range=3):
    arabic_re = re.compile(r'[\u0600-\u06FF][\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s,\.\-\(\)/]*')
    for d in range(search_range):
        for sign in ([0] if d == 0 else [-d, d]):
            j = idx + sign
            if 0 <= j < len(lines):
                for part in arabic_re.findall(lines[j]):
                    cleaned = part.strip(' ,.-/()')
                    cleaned = re.sub(r'\s+', ' ', cleaned)
                    if len(cleaned) > 1 and cleaned not in ('كيلو غرام', 'عدد', 'ى'):
                        return cleaned
    return None


def parse_tsc(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        raw_lines = f.readlines()

    lines = [strip_bidi(l.rstrip('\n')) for l in raw_lines]
    total_lines = len(lines)

    serial_at_line = {}

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue

        serial = None

        patterns = [
            re.compile(r'(\d{8,10})\s+([\d,]+)\s*$'),
            re.compile(r'(\d{8,10})[\u0600-\u06FF\u0750-\u077F\s\(\)\-/,]+?([\d,]+)\s*$'),
        ]

        for pat in patterns:
            m = pat.search(stripped)
            if m:
                s = m.group(2).replace(',', '')
                if s.isdigit() and 1 <= int(s) <= 10500:
                    serial = int(s)
                    break

        if serial is None:
            m = re.search(r'[\u0600-\u06FF\s\(\)\-/,.]+([\d,]+)\s*$', stripped)
            if m:
                s = m.group(1).replace(',', '')
                if s.isdigit() and 1 <= int(s) <= 10500:
                    candidate_s = s
                    if not re.search(r'\d\.\d{3}\s*$', stripped):
                        serial = int(candidate_s)

        if serial is None:
            m = re.search(r'([\d,]+)\s*$', stripped)
            if m:
                s = m.group(1).replace(',', '')
                if s.isdigit() and 1 <= int(s) <= 10500:
                    before_num = stripped[:m.start()].strip()
                    if not re.search(r'\d\.\d{3}$', before_num):
                        serial = int(s)

        if serial is not None and serial not in serial_at_line:
            serial_at_line[serial] = i

    print(f"Phase 1: Found {len(serial_at_line)} serial numbers")

    entries = {}

    for serial, line_idx in sorted(serial_at_line.items()):
        line = lines[line_idx]

        hs_code = None
        hs_line_idx = None

        hs_re = re.compile(r'(?:^|\s|[\u0600-\u06FF\(\)])(\d{8,10})(?:\s|[\u0600-\u06FF\(\)]|$)')
        m = hs_re.search(line)
        if m:
            hs_code = m.group(1)
            hs_line_idx = line_idx

        if not hs_code:
            for d in [-1, 1, -2, 2, -3, 3, -4, 4, -5, 5]:
                j = line_idx + d
                if 0 <= j < total_lines:
                    m = hs_re.search(lines[j])
                    if m:
                        hs_code = m.group(1)
                        hs_line_idx = j
                        break

        if not hs_code:
            continue

        if len(hs_code) == 10 and hs_code.startswith('00'):
            hs_code = hs_code[2:]

        ref = hs_line_idx if hs_line_idx is not None else line_idx
        context = get_context(lines, ref, before=3, after=3)

        cst_code = None
        for j_offset in [0, -1, 1, -2, 2]:
            j = ref + j_offset
            if 0 <= j < total_lines:
                cst_code = find_cst(lines[j])
                if cst_code:
                    break

        min_val, max_val, avg_val = extract_values(context)
        unit_code = extract_unit(context)
        description = extract_description(lines, ref)

        entries[serial] = {
            "serial": serial,
            "hs_code": hs_code,
            "cst_code": cst_code,
            "description": description,
            "unit_code": unit_code,
            "min": min_val,
            "max": max_val,
            "avg": avg_val,
        }

    print(f"Phase 1 result: {len(entries)} entries")

    found_serials = set(entries.keys())
    max_serial = max(found_serials)
    missing = sorted(set(range(1, max_serial + 1)) - found_serials)
    print(f"Phase 2: {len(missing)} missing serials, attempting recovery...")

    hs_locations = {}
    hs_finder = re.compile(r'(?:^|\s|[\u0600-\u06FF\(\)])(\d{8,10})(?:\s|[\u0600-\u06FF\(\)]|$)')
    for i, line in enumerate(lines):
        for m in hs_finder.finditer(line):
            hs = m.group(1)
            if len(hs) >= 8:
                if i not in hs_locations:
                    hs_locations[i] = []
                hs_locations[i].append(hs)

    recovered = 0
    for ms in missing:
        prev_s = None
        next_s = None
        for s in range(ms - 1, max(0, ms - 20), -1):
            if s in serial_at_line:
                prev_s = s
                break
        for s in range(ms + 1, min(max_serial + 1, ms + 20)):
            if s in serial_at_line:
                next_s = s
                break

        if prev_s is not None and next_s is not None:
            start = serial_at_line[prev_s]
            end = serial_at_line[next_s]
        elif prev_s is not None:
            start = serial_at_line[prev_s]
            end = min(start + 20, total_lines)
        elif next_s is not None:
            end = serial_at_line[next_s]
            start = max(end - 20, 0)
        else:
            continue

        used_lines = set()
        for e in entries.values():
            if e['serial'] in serial_at_line:
                used_lines.add(serial_at_line[e['serial']])

        best_hs = None
        best_line = None
        for j in range(start, end + 1):
            if j in hs_locations and j not in used_lines:
                best_hs = hs_locations[j][0]
                best_line = j
                break

        if not best_hs:
            for j in range(start, end + 1):
                if j in hs_locations:
                    best_hs = hs_locations[j][0]
                    best_line = j
                    break

        if best_hs:
            if len(best_hs) == 10 and best_hs.startswith('00'):
                best_hs = best_hs[2:]

            context = get_context(lines, best_line, before=3, after=3)
            cst_code = None
            for j_offset in [0, -1, 1, -2, 2]:
                j2 = best_line + j_offset
                if 0 <= j2 < total_lines:
                    cst_code = find_cst(lines[j2])
                    if cst_code:
                        break

            min_val, max_val, avg_val = extract_values(context)
            unit_code = extract_unit(context)
            description = extract_description(lines, best_line)

            entries[ms] = {
                "serial": ms,
                "hs_code": best_hs,
                "cst_code": cst_code,
                "description": description,
                "unit_code": unit_code,
                "min": min_val,
                "max": max_val,
                "avg": avg_val,
            }
            serial_at_line[ms] = best_line
            recovered += 1

    print(f"Phase 2: Recovered {recovered} entries")

    result = sorted(entries.values(), key=lambda x: x['serial'])

    no_avg = sum(1 for r in result if r['avg'] is None)
    no_min = sum(1 for r in result if r['min'] is None)
    no_desc = sum(1 for r in result if not r['description'])
    no_unit = sum(1 for r in result if not r['unit_code'])
    no_cst = sum(1 for r in result if not r['cst_code'])
    has_all = sum(1 for r in result if r['min'] is not None and r['max'] is not None and r['avg'] is not None and r['hs_code'])
    print(f"\nFinal: {len(result)} entries")
    print(f"Complete (hs+min+max+avg): {has_all}")
    print(f"Missing fields - avg: {no_avg}, min: {no_min}, desc: {no_desc}, unit: {no_unit}, cst: {no_cst}")
    if result:
        print(f"Serial range: {result[0]['serial']} - {result[-1]['serial']}")
        still_missing = sorted(set(range(1, result[-1]['serial'] + 1)) - set(e['serial'] for e in result))
        print(f"Still missing ({len(still_missing)}): {still_missing[:50]}")

    output = {
        "source_file": "TSC_2025-10-13.pdf",
        "extracted_rows": len(result),
        "rows": result
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nWrote to {output_file}")


if __name__ == '__main__':
    input_file = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tsc_test.txt'
    output_file = sys.argv[2] if len(sys.argv) > 2 else '/tmp/tsc_complete.json'
    parse_tsc(input_file, output_file)
