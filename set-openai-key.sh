#!/bin/bash
# سكريبت لتحديث مفتاح OpenAI
# الاستخدام: ./set-openai-key.sh sk-xxxxxxxxxxxx

if [ -z "$1" ]; then
  echo "❌ خطأ: لم يتم تمرير المفتاح"
  echo ""
  echo "الاستخدام:"
  echo "  ./set-openai-key.sh sk-your-key-here"
  echo ""
  echo "احصل على مفتاحك من: https://platform.openai.com/api-keys"
  exit 1
fi

KEY="$1"

if [[ ! "$KEY" =~ ^sk- ]]; then
  echo "⚠️  تحذير: المفتاح الصحيح يبدأ عادةً بـ 'sk-'"
  echo "المفتاح اللي أدخلته يبدأ بـ: ${KEY:0:6}..."
  read -p "هل تريد المتابعة على أي حال؟ (y/n) " confirm
  if [ "$confirm" != "y" ]; then
    exit 1
  fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

cat > "$ENV_FILE" <<EOF
OPENAI_API_KEY=$KEY
EOF

echo "✅ تم حفظ المفتاح في $ENV_FILE"
echo ""
echo "الخطوة التالية: أعد تشغيل التطبيق من زر Restart في الواجهة"
echo "أو نفّذ:  pkill -f 'tsx server'"
