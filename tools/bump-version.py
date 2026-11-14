# 改版本号：python3 tools/bump-version.py 0.8.51 ，再 node tools/build-extension.mjs
import sys,re
if len(sys.argv)!=2: raise SystemExit('Usage: python tools/bump-version.py x.y.z')
new=sys.argv[1]
if not re.fullmatch(r'\d+\.\d+\.\d+',new): raise SystemExit('Expected version x.y.z')
import os; root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))+'/'
for f,pat in [('package.json',r'"version": "[\d.]+"'),('manifest.json',r'"version": "[\d.]+"')]:
    s=open(root+f,encoding='utf-8').read(); s=re.sub(pat,f'"version": "{new}"',s,1); open(root+f,'w',encoding='utf-8',newline='\n').write(s)
s=open(root+'tools/build-extension.mjs',encoding='utf-8').read()
s=re.sub(r"globalThis.__PC_VERSION = '[\d.]+';\"\);",f"globalThis.__PC_VERSION = '{new}';\");",s,1)
s=re.sub(r"'智库 · 原生扩展版 v[\d.]+'\);",f"'智库 · 原生扩展版 v{new}');",s,1)
s=re.sub(r"(?<![_a-z])version:'[\d.]+'",f"version:'{new}'",s)
s=re.sub(r"console.log\('Extension [\d.]+ built",f"console.log('Extension {new} built",s,1)
open(root+'tools/build-extension.mjs','w',encoding='utf-8',newline='\n').write(s)
r=open(root+'README.md',encoding='utf-8').read()
r=re.sub(r"版本 \*\*[\d.]+\*\*",f"版本 **{new}**",r,1)
open(root+'README.md','w',encoding='utf-8',newline='\n').write(r)
