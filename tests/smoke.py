"""End-to-end browser tests to run on a machine with Chromium/Playwright available.

python3 -m http.server 8080 --bind 127.0.0.1 &
python3 tests/smoke.py

Note: browser automation is restricted in the artifact-build environment;
these scripts are provided to execute later on a local machine.
"""
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8080'

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width":390,"height":844})
        errors=[]
        page.on('pageerror', lambda exc: errors.append(str(exc)))
        page.goto(URL,wait_until='domcontentloaded')
        page.get_by_text('كل دراستك في مكان واحد').wait_for(timeout=15000)
        assert page.locator('.course-card').count() == 6
        page.locator('.mobile-nav [data-go="courses"]').click()
        page.get_by_text('إدارة مشاريع نظم المعلومات الجغرافية').first.wait_for()
        assert page.locator('.course-card').count()==7
        # Open centralized import page
        page.locator('.mobile-nav [data-action="toggle-menu"]').click()
        page.locator('.sidebar [data-go="import"]').click()
        page.get_by_text('ارفع ملفات المحاضرات والمراجع').wait_for()
        # Add a course task
        page.locator('.mobile-nav [data-action="toggle-menu"]').click()
        page.locator('.sidebar [data-go="tasks"]').click()
        page.locator('[data-action="add-task"]').click()
        page.locator('input[name=title]').fill('اختبار مهمة محلية')
        page.locator('select[name=courseId]').select_option('course-1')
        page.locator('#task-form button[type=submit]').click()
        page.get_by_text('اختبار مهمة محلية').wait_for()
        page.reload()
        page.get_by_text('اختبار مهمة محلية').wait_for()
        assert not errors,errors
        browser.close()
        print('Browser smoke tests passed')

if __name__=='__main__':
    run()
