chrome.storage.local.get(['lastSnapshot','autoEnabled']).then(({lastSnapshot,autoEnabled}) => {
  const count = lastSnapshot?.courses?.length || 0;
  document.getElementById('state').textContent = count
    ? `آخر فحص: ${count} مساقات · ${new Date(lastSnapshot.at).toLocaleString('ar')} · المزامنة الدورية ${autoEnabled ? 'مفعّلة' : 'معطّلة'}`
    : 'لا توجد مزامنة بعد. افتح UCAS واضغط «مزامنة من Moodle». إنشاء نسخة محلية لا يتطلب API.';
});
