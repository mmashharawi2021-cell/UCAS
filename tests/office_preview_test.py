"""Run isolated Office-preview logic in headless Chromium without network access."""
import base64
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (ROOT/'js/office.js').read_text(encoding='utf8').replace('export async function previewOffice','async function previewOffice') + '\nwindow.previewOffice=previewOffice; void 0;'

def sample(entries):
    dst = BytesIO()
    with ZipFile(dst, 'w', ZIP_DEFLATED) as archive:
        for name, body in entries.items():
            archive.writestr(name, body)
    return base64.b64encode(dst.getvalue()).decode()

def preview(page, name, b64):
    return page.evaluate('''async ({name,data})=>{
      const raw=atob(data);const bytes=Uint8Array.from(raw,x=>x.charCodeAt(0));
      return await window.previewOffice(new File([bytes],name));
    }''', {'name':name, 'data':b64})

def run():
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        page=browser.new_page()
        page.set_content('<html><body></body></html>')
        page.evaluate(SCRIPT)
        docx=sample({'word/document.xml': '''<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>المحاضرة الأولى</w:t></w:r></w:p><w:p><w:r><w:t>قاعدة البيانات</w:t></w:r></w:p></w:body></w:document>'''})
        doc=preview(page,'lesson.docx',docx)
        assert 'المحاضرة الأولى\nقاعدة البيانات' in doc['text'],doc
        pptx=sample({'ppt/slides/slide2.xml':'<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>الثانية</a:t></a:r></a:p></p:sld>', 'ppt/slides/slide1.xml':'<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>الأولى</a:t></a:r></a:p></p:sld>'})
        slides=preview(page,'slides.pptx',pptx)
        assert slides['text'].index('شريحة 1')<slides['text'].index('شريحة 2'),slides
        try:
            preview(page,'bad.docx',base64.b64encode(b'bad zip').decode())
            raise AssertionError('Malformed ZIP accepted')
        except Exception as error:
            assert 'أرشيف' in str(error) or 'ZIP' in str(error),error
        browser.close()
    print('Office preview: 3 isolated browser tests passed')

if __name__=='__main__':run()
