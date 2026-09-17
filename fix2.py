with open('api/og-meta.ts', encoding='utf-8') as f:
    lines = f.readlines()

# Find indices of all three 'if (article.content)' blocks
targets = [i for i, l in enumerate(lines) if 'if (article.content)' in l]
print('Found at lines:', targets)

if len(targets) == 3:
    # Keep only the first block (3 lines: if, bodyExtra, closing brace)
    # Remove the 2nd and 3rd blocks
    to_remove = set()
    for idx in targets[1:]:
        to_remove.add(idx)      # if line
        to_remove.add(idx + 1)  # bodyExtra line
        to_remove.add(idx + 2)  # closing brace
    new_lines = [l for i, l in enumerate(lines) if i not in to_remove]
    with open('api/og-meta.ts', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print('Fixed - removed duplicates')
else:
    print('Unexpected count, no changes made')
