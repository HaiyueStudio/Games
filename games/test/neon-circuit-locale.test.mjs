import assert from 'node:assert/strict';
import test from 'node:test';
import { LANGUAGES, TEXT, COURSE_TEXT, LANGUAGE_KEY, readLanguage, saveLanguage, lapNotice, localizeCourse } from '../neon-circuit/NeonLocale.ts';
import { CIRCUITS } from '../neon-circuit/RaceRules.ts';

test('language defaults to Chinese and survives a new storage reader without touching records', () => {
  const data = new Map([['race-record','123.45']]);
  const storage = {getItem:key => data.get(key) ?? null,setItem:(key,value) => data.set(key,value)};
  assert.equal(readLanguage(storage),'zh');
  saveLanguage(storage,'ja');
  assert.equal(readLanguage({...storage}),'ja');
  assert.equal(data.get('race-record'),'123.45');
  data.set(LANGUAGE_KEY,'invalid');
  assert.equal(readLanguage(storage),'zh');
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.equal(readLanguage(blocked),'zh');
  assert.doesNotThrow(() => saveLanguage(blocked,'en'));
});
test('all locales cover every UI key and course without changing simulation data', () => {
  for(const language of LANGUAGES) {
    assert.deepEqual(Object.keys(TEXT[language]).sort(),Object.keys(TEXT.zh).sort());
    assert.ok(Object.values(TEXT[language]).every(value => value.trim().length));
    for(const course of CIRCUITS) {
      const translated=localizeCourse(course,language);
      assert.equal(translated.id,course.id);
      assert.equal(translated.theme,course.theme);
      if(language!=='zh') assert.ok(COURSE_TEXT[language][course.id]?.name);
    }
  }
  assert.equal(lapNotice('zh',2,3),'第 2 / 3 圈');
  assert.equal(lapNotice('en',2,3),'LAP 2 / 3');
  assert.equal(lapNotice('ja',2,3),'2 / 3 周目');
});
