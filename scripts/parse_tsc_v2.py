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

    entries = []
    seen = set()

    for i, line in enumerate(lines):
        cst_hs = re.search(r'\b([A-Z][A-Z0-9]{3})\s+(\d{8,10})\b', line)
        if not cst_hs:
            cst_hs = re.search(r'\b([A-Z][A-Z0-9]{2,3})\s+(\d{8,10})\b', line)
        if not cst_hs:
            continue

        cst_code = cst_hs.group(1)
        hs_code = cst_hs.group(2)

        if cst_code in UNIT_CODES or cst_code == 'TSC':
            continue

        if len(hs_code) == 10 and hs_code.startswith('00'):
            hs_code = hs_code[2:]

        serial_match = re.search(r'([\d,]+)\s*$', line.strip())
        serial_num = None
        if serial_match:
            s = serial_match.group(1).replace(',', '')
            if s.isdigit() and 1 <= int(s) <= 15000:
                serial_num = int(s)

        context_lines = []
        for j in range(max(0, i - 3), min(len(lines), i + 4)):
            context_lines.append(lines[j])
        context = ' '.join(context_lines)

        nums = re.findall(r'(\d[\d,]*\.\d{3})', context)
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
            for k in range(len(float_nums) - 2):
                a, b, c = float_nums[k], float_nums[k+1], float_nums[k+2]
                if a <= c <= b or (a <= b and abs(c - (a+b)/2) < max(b, 1)):
                    min_val = a
                    max_val = b
                    avg_val = c
                    break
            if min_val is None:
                min_val = float_nums[0]
                max_val = float_nums[1]
                avg_val = float_nums[2]

        unit_match = re.search(r'\b(' + '|'.join(UNIT_CODES) + r')\b', context)
        unit_code = unit_match.group(1) if unit_match else None

        arabic_re = re.compile(r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]')
        desc_parts = []
        for part in re.split(r'[0-9A-Z]{4,}|\d{8,10}|[\d,]+\.\d{3}', line):
            if arabic_re.search(part):
                cleaned = part.strip()
                cleaned = re.sub(r'\s+', ' ', cleaned)
                if len(cleaned) > 1:
                    desc_parts.append(cleaned)

        desc_text = ' '.join(desc_parts).strip()
        desc_text = re.sub(r'\s+', ' ', desc_text)

        key = f"{hs_code}_{cst_code}_{serial_num}"
        if key in seen:
            continue
        seen.add(key)

        entries.append({
            "serial": serial_num if serial_num else len(entries) + 1,
            "hs_code": hs_code,
            "cst_code": cst_code,
            "description": desc_text if desc_text else None,
            "unit_code": unit_code,
            "min": min_val,
            "max": max_val,
            "avg": avg_val,
        })

    entries.sort(key=lambda x: x['serial'])

    print(f"Extracted {len(entries)} unique entries")

    no_avg = sum(1 for r in entries if r['avg'] is None)
    no_min = sum(1 for r in entries if r['min'] is None)
    no_desc = sum(1 for r in entries if not r['description'])
    no_unit = sum(1 for r in entries if not r['unit_code'])
    print(f"Missing - avg: {no_avg}, min: {no_min}, desc: {no_desc}, unit: {no_unit}")

    output = {
        "source_file": "TSC_2025-10-13.pdf",
        "extracted_rows": len(entries),
        "rows": entries
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Wrote to {output_file}")
    return entries


if __name__ == '__main__':
    input_file = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tsc_test.txt'
    output_file = sys.argv[2] if len(sys.argv) > 2 else '/tmp/tsc_parsed_v2.json'
    parse_tsc(input_file, output_file)
