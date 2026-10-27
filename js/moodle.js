// Read-only student workflow: text that the student explicitly pasted from Moodle.
// No Moodle credentials, sessions, tokens, or page scraping are used.
export function cleanMoodlePaste(input){
 if(typeof input!=='string')throw new TypeError('يجب لصق نص المحاضرة');
 const text=input.replace(/\r\n?/g,'\n').replace(/\u0000/g,'').trim();
 if(text.length<20)throw new Error('النص قصير جدًا؛ الصق 20 حرفًا على الأقل من محتوى المحاضرة');
 if(text.length>120000)throw new Error('النص طويل جدًا؛ لا تتجاوز 120 ألف حرف');
 return text;
}
