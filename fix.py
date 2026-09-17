import re

with open('api/og-meta.ts', encoding='utf-8') as f:
    content = f.read()

# Remove duplicate if(article.content) blocks, keep only one
pattern = r'(      if \(article\.content\) \{[^}]+\}\n)(      if \(article\.content\) \{[^}]+\}\n)(      if \(article\.content\) \{[^}]+\})'
replacement = r'\1'
content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('api/og-meta.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
