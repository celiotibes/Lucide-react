#!/bin/bash
# Notify Slack Channel - Enviar notificações para Slack

MESSAGE="${1:-No message provided}"
CHANNEL="${2:-#deployments}"
WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
COLOR="${3:-good}" # good, warning, danger

if [ -z "$WEBHOOK_URL" ]; then
  echo "❌ Error: SLACK_WEBHOOK_URL não está configurada"
  exit 1
fi

# Build JSON payload
PAYLOAD=$(cat <<EOF
{
  "channel": "$CHANNEL",
  "attachments": [
    {
      "fallback": "$MESSAGE",
      "color": "$COLOR",
      "title": "Sistema de Gerenciamento de Aluguéis",
      "text": "$MESSAGE",
      "footer": "Rental Sync",
      "ts": $(date +%s)
    }
  ]
}
EOF
)

# Send to Slack
RESPONSE=$(curl -s -X POST \
  -H 'Content-type: application/json' \
  --data "$PAYLOAD" \
  "$WEBHOOK_URL")

if echo "$RESPONSE" | grep -q "ok"; then
  echo "✅ Slack notification sent to $CHANNEL"
else
  echo "❌ Failed to send Slack notification"
  echo "$RESPONSE"
  exit 1
fi
