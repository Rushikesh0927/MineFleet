#!/bin/bash
invoke_url='https://integrate.api.nvidia.com/v1/chat/completions'

authorization_header='Authorization: Bearer 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'
accept_header='Accept: application/json'
content_type_header='Content-Type: application/json'

data=$'{
  "model": "z-ai/glm-5.2",
  "messages": [
    {
      "role": "user",
      "content": "Hello! How do I craft a diamond pickaxe?"
    }
  ],
  "temperature": 1,
  "top_p": 1,
  "max_tokens": 16384,
  "seed": 42,
  "stream": true
}'

response=$(curl --silent -i -w "\n%{http_code}" --request POST \
  --url "$invoke_url" \
  --header "$authorization_header" \
  --header "$accept_header" \
  --header "$content_type_header" \
  --data "$data"
)

echo "$response"
