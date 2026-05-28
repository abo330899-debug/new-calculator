import re
import json
import sys

def strip_bidi(text):
    return re.sub(r'[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c\ufeff]', '', text)

UNIT_CODES = {'KGM', 'KG', 'NMB', 'LTR', 'MTR', 'MTK', 'MTQ', 'M2', 'M3', 'SET', 'PCE', 'PRS', 'TNE', 'GRM'}

def parse_tsc(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        raw_lines = f.readlines()

    lines = [strip_bidi(l.rstrip('\n')) for l in raw_lines]

    num_re = re.compile(r'(\d[\d,]*\.\d{3})')

    entries_by_serial = {}

    for i, line in enumerate(lines):
        serial = None
        hs_code = None

        m1 = re.search(r'(\d{8,10})\s+([\d,]+)\s*$', line)
        if m1:
            hs_code = m1.group(1)
            serial_str = m1.group(2).replace(',', '')
            if serial_str.isdigit() and 1 <= int(serial_str) <= 15000:
                serial = int(serial_str)

        if not serial:
            m2 = re.search(r'(\d{8,10})[\u0600-\u06FF\s]+([\d,]+)\s*$', line)
            if m2:
                hs_code = m2.group(1)
                serial_str = m2.group(2).replace(',', '')
                if serial_str.isdigit() and 1 <= int(serial_str) <= 15000:
                    serial = int(serial_str)

        if not serial:
            m3 = re.search(r'([\d,]+)\s+(\d{8,10})\s+([A-Z][A-Z0-9]{2,3})', line)
            if m3:
                serial_str = m3.group(1).replace(',', '')
                if serial_str.isdigit() and 1 <= int(serial_str) <= 15000:
                    serial = int(serial_str)
                    hs_code = m3.group(2)

        if not serial or not hs_code:
            continue

        if len(hs_code) == 10 and hs_code.startswith('00'):
            hs_code = hs_code[2:]

        if serial in entries_by_serial:
            continue

        cst_code = None
        cst_patterns = [
            re.compile(r'([A-Z][A-Z0-9]{3})\s+' + re.escape(hs_code.zfill(10) if len(hs_code) == 8 else hs_code)),
            re.compile(r'([A-Z][A-Z0-9]{3})\s+' + re.escape(hs_code)),
            re.compile(r'([A-Z][A-Z0-9]{2,3})\s+' + re.escape(hs_code)),
            re.compile(r'([A-Z][A-Z0-9]{3})(?=[\u0600-\u06FF])'),
            re.compile(r'([A-Z][A-Z0-9]{2,3})(?=[\u0600-\u06FF])'),
            re.compile(r'\b([A-Z][A-Z0-9]{3})\b'),
            re.compile(r'\b([A-Z][A-Z0-9]{2,3})\b'),
        ]
        for pat in cst_patterns:
            cm = pat.search(line)
            if cm:
                candidate = cm.group(1)
                if candidate not in UNIT_CODES and candidate != 'TSC' and candidate != 'SPP':
                    cst_code = candidate
                    break

        context_lines = []
        for j in range(max(0, i - 3), min(len(lines), i + 4)):
            context_lines.append(lines[j])
        context = ' '.join(context_lines)

        nums = num_re.findall(context)
        float_nums = []
        for n in nums:
            try:
                v = float(n.replace(',', ''))
                if v < 1000000:
                    float_nums.append(v)
            except:
                pass

        min_val = None
        max_val = None
        avg_val = None

        if len(float_nums) >= 3:
            best = None
            for k in range(len(float_nums) - 2):
                a, b, c = float_nums[k], float_nums[k+1], float_nums[k+2]
                if a <= b and a <= c <= b:
                    best = (a, b, c)
                    break
            if best:
                min_val, max_val, avg_val = best
            else:
                min_val = float_nums[0]
                max_val = float_nums[1]
                avg_val = float_nums[2]
        elif len(float_nums) == 2:
            min_val = float_nums[0]
            max_val = float_nums[1]
        elif len(float_nums) == 1:
            avg_val = float_nums[0]

        unit_match = re.search(r'\b(' + '|'.join(UNIT_CODES) + r')\b', context)
        unit_code = unit_match.group(1) if unit_match else None

        desc_parts = []
        for part in re.findall(r'[\u0600-\u06FF][\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s,\.\-\(\)/]*', line):
            cleaned = part.strip(' ,.-/()')
            cleaned = re.sub(r'\s+', ' ', cleaned)
            if len(cleaned) > 1 and cleaned not in ('كيلو غرام', 'عدد'):
                desc_parts.append(cleaned)
        desc_text = ' '.join(desc_parts).strip()

        if not desc_text:
            for j in range(max(0, i-2), min(len(lines), i+2)):
                for part in re.findall(r'[\u0600-\u06FF][\u0600-\u06FF\s,\.\-\(\)/]{2,}', lines[j]):
                    cleaned = part.strip(' ,.-/()')
                    if len(cleaned) > 2 and cleaned not in ('كيلو غرام', 'عدد', 'ى'):
                        desc_parts.append(cleaned)
            desc_text = ' '.join(desc_parts).strip()

        desc_text = re.sub(r'\s+', ' ', desc_text).strip()

        entries_by_serial[serial] = {
            "serial": serial,
            "hs_code": hs_code,
            "cst_code": cst_code,
            "description": desc_text if desc_text else None,
            "unit_code": unit_code,
            "min": min_val,
            "max": max_val,
            "avg": avg_val,
        }

    entries = sorted(entries_by_serial.values(), key=lambda x: x['serial'])

    print(f"Extracted {len(entries)} unique entries")

    no_avg = sum(1 for r in entries if r['avg'] is None)
    no_min = sum(1 for r in entries if r['min'] is None)
    no_desc = sum(1 for r in entries if not r['description'])
    no_unit = sum(1 for r in entries if not r['unit_code'])
    no_cst = sum(1 for r in entries if not r['cst_code'])
    print(f"Missing - avg: {no_avg}, min: {no_min}, desc: {no_desc}, unit: {no_unit}, cst: {no_cst}")

    if entries:
        print(f"Serial range: {entries[0]['serial']} - {entries[-1]['serial']}")
        expected = set(range(1, entries[-1]['serial'] + 1))
        actual = set(e['serial'] for e in entries)
        missing = sorted(expected - actual)
        if missing:
            print(f"Missing serials ({len(missing)}): first 30 = {missing[:30]}")

    output = {
        "source_file": "TSC_2025-10-13.pdf",
        "extracted_rows": len(entries),
        "rows": entries
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Wrote to {output_file}")


if __name__ == '__main__':
    input_file = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tsc_test.txt'
    output_file = sys.argv[2] if len(sys.argv) > 2 else '/tmp/tsc_final.json'
    parse_tsc(input_file, output_file)
