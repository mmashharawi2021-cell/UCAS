"""Run the HTML parser with a real Chromium DOMParser, without localhost networking."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
fixture='''<!doctype html><html lang="ar"><head><meta name="generator" content="Moodle 4"/><title>بناء قواعد البيانات الجغرافية | UCAS</title><base href="https://moodle.ucas.edu.ps/"/></head><body id="page-course-view-topics" class="pagelayout-course"><div id="page-header"><h1>بناء قواعد البيانات الجغرافية</h1></div><div class="course-content"><ul><li class="section main"><h3 class="sectionname">الوحدة الأولى</h3><ul><li class="activity modtype_resource"><div class="activityname"><a class="aalink" href="/mod/resource/view.php?id=1777&sesskey=DO-NOT-STORE">المحاضرة الأولى</a></div></li><li class="activity modtype_assign"><div class="activityname"><a class="aalink" href="https://evil.test/mod/assign/view.php?id=4">واجب روابط غير آمنة</a></div></li></ul></li></ul></div><script>window.ranUntrusted=true</script></body></html>'''
source=(root/'js/moodle.js').read_text(encoding='utf8').replace('export function','function')
with sync_playwright() as playwright:
    browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page()
    page.set_content('<html><body><main>Chromium DOMParser</main></body></html>')
    result=page.evaluate('(args)=>{\n'+source+'''\nconst parsed=parseMoodleCourseHTML(args.fixture);
      return {parsed,untrusted:window.ranUntrusted||false,safe:safeMoodleActivityURL('/mod/assign/view.php?id=22&sesskey=LEAK')}}''',{'fixture':fixture})
    assert result['parsed']['resources'][0]['url']=='https://moodle.ucas.edu.ps/mod/resource/view.php?id=1777',result
    assert result['safe']=='https://moodle.ucas.edu.ps/mod/assign/view.php?id=22',result
    assert not result['untrusted'],result
    assert not any('DO-NOT-STORE' in str(r) or 'evil.test' in str(r.get('url','')) for r in result['parsed']['resources']),result
    print('PASS: Chromium DOMParser Moodle export, script inert, UCAS-only link sanitization')
    browser.close()
