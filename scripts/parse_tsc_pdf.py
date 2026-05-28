import re
import json
import sys

def strip_bidi(text):
    return re.sub(r'[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c\ufeff]', '', text)

def parse_tsc(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        raw = f.read()

    raw = strip_bidi(raw)

    pattern = re.compile(
        r'(\b[A-Z][A-Z0-9]{2,3}\b)\s+'
        r'(\d{8,10})\s+'
        r'([\d,]+)'
    )

    number_pattern = re.compile(r'(\d[\d,]*\.\d{3})')

    lines = raw.split('\n')

    entries = []
    i = 0
    while i < len(lines):
        line = strip_bidi(lines[i])

        match = re.search(r'(\b[A-Z][A-Z0-9]{2,3})\s+(\d{8,10})\s+([\d,]+)', line)
        if not match:
            match = re.search(r'(\b[A-Z][A-Z0-9]{2,3})\s+(\d{8,10})', line)

        if match:
            cst_code = match.group(1)
            hs_code = match.group(2)

            serial_match = re.search(r'([\d,]+)\s*$', line[match.end():].strip()) if len(match.groups()) < 3 else None
            if len(match.groups()) >= 3:
                serial_str = match.group(3)
            elif serial_match:
                serial_str = serial_match.group(1)
            else:
                serial_str = ""

            serial_num = serial_str.replace(',', '') if serial_str else ""

            context = ""
            for j in range(max(0, i - 3), min(len(lines), i + 4)):
                context += " " + strip_bidi(lines[j])

            numbers = number_pattern.findall(context)
            float_nums = []
            for n in numbers:
                try:
                    float_nums.append(float(n.replace(',', '')))
                except:
                    pass

            min_val = None
            max_val = None
            avg_val = None

            if len(float_nums) >= 3:
                min_val = float_nums[-3]
                max_val = float_nums[-2]
                avg_val = float_nums[-1]
            elif len(float_nums) == 2:
                min_val = float_nums[0]
                max_val = float_nums[1]
            elif len(float_nums) == 1:
                avg_val = float_nums[0]

            unit_match = re.search(r'\b(KGM|KG|NMB|LTR|MTR|MTK|MTQ|M2|M3|SET|PCE|PRS|TNE|GRM)\b', context)
            unit_code = unit_match.group(1) if unit_match else None

            desc_text = ""
            arabic_parts = re.findall(r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF][^\n\d]*', line)
            if arabic_parts:
                desc_text = ' '.join(arabic_parts).strip()
                desc_text = re.sub(r'\s+', ' ', desc_text).strip()

            entries.append({
                "serial": int(serial_num) if serial_num.isdigit() else len(entries) + 1,
                "hs_code": hs_code,
                "cst_code": cst_code,
                "description": desc_text if desc_text else None,
                "unit_code": unit_code,
                "min": min_val,
                "max": max_val,
                "avg": avg_val,
            })

        i += 1

    print(f"Found {len(entries)} entries via CST+HS pattern")

    if len(entries) < 5000:
        print("Trying alternative parsing...")
        entries = parse_alternative(lines)

    output = {
        "source_file": "TSC_2025-10-13.pdf",
        "extracted_rows": len(entries),
        "rows": entries
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(entries)} entries to {output_file}")
    return entries


def parse_alternative(lines):
    entries = []
    all_text = '\n'.join(lines)
    all_text = strip_bidi(all_text)

    hs_pattern = re.compile(r'\b(\d{8,10})\b')
    num_pattern = re.compile(r'(\d[\d,]*\.\d{3})')

    seen_serials = set()

    for i, raw_line in enumerate(lines):
        line = strip_bidi(raw_line)

        hs_matches = list(hs_pattern.finditer(line))
        if not hs_matches:
            continue

        for hs_match in hs_matches:
            hs_code = hs_match.group(1)

            if len(hs_code) < 8:
                continue
            if hs_code.startswith('000') and len(hs_code) == 10:
                hs_code = hs_code[2:]

            context = ""
            for j in range(max(0, i - 2), min(len(lines), i + 3)):
                context += " " + strip_bidi(lines[j])

            cst_match = re.search(r'\b([A-Z][A-Z0-9]{2,3})\b', line)
            cst_code = cst_match.group(1) if cst_match else None

            if cst_code in ('KGM', 'KG', 'NMB', 'LTR', 'MTR', 'MTK', 'MTQ', 'SET', 'PCE', 'PRS', 'TNE', 'GRM', 'TSC'):
                cst_code = None

            numbers = num_pattern.findall(context)
            float_nums = []
            for n in numbers:
                try:
                    float_nums.append(float(n.replace(',', '')))
                except:
                    pass

            min_val = None
            max_val = None
            avg_val = None
            if len(float_nums) >= 3:
                reasonable = [n for n in float_nums if n < 100000]
                if len(reasonable) >= 3:
                    min_val = reasonable[0]
                    max_val = reasonable[1]
                    avg_val = reasonable[2]

            serial_match = re.search(r'([\d,]+)\s*$', line.strip())
            serial_str = ""
            if serial_match:
                s = serial_match.group(1).replace(',', '')
                if s.isdigit() and int(s) <= 15000:
                    serial_str = s

            serial_num = int(serial_str) if serial_str else len(entries) + 1
            if serial_num in seen_serials and serial_str:
                serial_num = len(entries) + 1
            seen_serials.add(serial_num)

            unit_match = re.search(r'\b(KGM|KG|NMB|LTR|MTR|MTK|MTQ|M2|M3|SET|PCE|PRS|TNE|GRM)\b', context)
            unit_code = unit_match.group(1) if unit_match else None

            desc_parts = re.findall(r'[\u0600-\u06FF][\u0600-\u06FF\u0750-\u077F\s,\-\(\)]*', line)
            desc_text = ' '.join(p.strip() for p in desc_parts if len(p.strip()) > 1)
            desc_text = re.sub(r'\s+', ' ', desc_text).strip()

            entries.append({
                "serial": serial_num,
                "hs_code": hs_code,
                "cst_code": cst_code,
                "description": desc_text if desc_text else None,
                "unit_code": unit_code,
                "min": min_val,
                "max": max_val,
                "avg": avg_val,
            })

    print(f"Alternative parse found {len(entries)} entries")
    return entries


if __name__ == '__main__':
    input_file = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tsc_test.txt'
    output_file = sys.argv[2] if len(sys.argv) > 2 else '/tmp/tsc_parsed.json'
    parse_tsc(input_file, output_file)
