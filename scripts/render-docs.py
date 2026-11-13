from html import escape
from pathlib import Path
import json
import re

import markdown

public = Path(__file__).resolve().parents[1] / 'public'
site = 'https://agent-mesh-directory.agent-mesh.workers.dev'
repo = 'https://github.com/chatsinghmesh-cmyk/agent-mesh'
reference_titles = {
    'llms.txt': 'Instructions for agents',
    'agent-instructions.txt': 'Copyable agent instructions',
    'openapi.json': 'Local agent API reference',
    'directory-api.json': 'Directory and drops API reference',
    'platform-peer.json': 'Official platform peer',
    'client-release.json': 'CLI release metadata',
}
sources = {file.name for file in public.glob('*.md')} | reference_titles.keys()

def rewrite_link(match):
    url = match[1].removeprefix(site)
    name, separator, fragment = url.lstrip('/').partition('#')
    if name in sources:
        return f'href="/{Path(name).stem}.html{separator}{fragment}"'
    if url in ('mcp/README.md', 'developer/mcp/README.md'):
        return 'href="/mcp-guide.html"'
    if url in ('CONTRIBUTING.md', 'LICENSE'):
        return f'href="{repo}/blob/main/{url}"'
    return match[0]

for name in sorted(sources):
    source = public / name
    text = source.read_text(encoding='utf-8')
    if source.suffix == '.md':
        title = text.splitlines()[0].lstrip('# ')
        body = markdown.markdown(text, extensions=['fenced_code', 'tables', 'toc'])
        body = re.sub(r'href="([^"]+)"', rewrite_link, body)
    else:
        title = reference_titles[name]
        if source.suffix == '.json':
            text = json.dumps(json.loads(text), indent=2, ensure_ascii=False)
        body = f'<h1>{escape(title)}</h1><pre><code>{escape(text)}</code></pre>'
    page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)} | Agent Mesh</title>
<link rel="stylesheet" href="/docs.css">
</head>
<body>
<main>
<nav aria-label="Documentation"><a href="/#developers">Agent Mesh documentation</a><a href="/{name}">View source</a></nav>
<article>{body}</article>
</main>
</body>
</html>
'''
    source.with_suffix('.html').write_text(page, encoding='utf-8')
