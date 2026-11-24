// Run with node tools/test-teacher-records.cjs. All saves stay in memory; no network is used.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const original = JSON.parse(fs.readFileSync(path.join(root, 'data/matches.json'), 'utf8'));
// Match native select behavior: assigning an absent option leaves the selection empty.
class Select {
  constructor(html) { this.innerHTML = html; }
  set innerHTML(html) {
    this.options = Array.from(html.matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g),
      match => ({ value: match[1], selected: /\bselected\b/.test(match[2]) }));
    this._value = (this.options.find(option => option.selected) || this.options[0] || {}).value || '';
  }
  get value() { return this._value; }
  set value(value) { this._value = this.options.some(option => option.value === value) ? value : ''; }
}
const fields = {}, saved = [], messages = [];
const box = {
  window: {}, DATA: structuredClone(original), isAdmin: true, token: 'test-only-no-network', lastSaveError: '',
  $: selector => fields[selector], render() {}, toast: message => messages.push(message), markPending() {},
  saveAll: async () => { saved.push(JSON.parse(JSON.stringify(box.DATA))); return true; }
};
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), box);
box.CFG = box.window.APP_CONFIG;
function section(start, end) {
  const begin = source.indexOf(start), finish = source.indexOf(end, begin);
  assert(begin >= 0 && finish > begin, 'Missing source section: ' + start);
  vm.runInContext(source.slice(begin, finish), box);
}
section('  var esc =', '  /* ---------- 提示');
section('  function guinnessConfig()', '  function matchdayHTML()');
section('  function recordPanelHTML(', '  function recordEventHTML(');
section('  function syncGuinnessRecordForm()', '  function deleteGuinnessRecord(');

async function run() {
  const students = Array.from(box.allGuinnessEvents()).filter(meta => !box.isTeacherEvent(meta.event.id));
  assert.equal(students.length, 19);
  Object.assign(fields, {
    '#recordRole': { value: 'student' }, '#recordEvent': new Select(box.recordEventOptions(students[0].event.id, false)),
    '#recordGender': new Select(box.genderOptions(students[0].event, 'female')),
    '#recordName': { value: ' 测试教师甲 ', focus() {} }, '#recordClass': { value: '9' },
    '#recordClassField': { style: { display: '' } }, '#recordResult': { value: '7.20', focus() {} },
    '#recordResultLabel': {}, '#recordRule': {}, '#recordDate': { value: '2026-11-24' },
    '#recordNote': { value: '仅内存测试' }
  });
  const eventSelect = fields['#recordEvent'];
  for (const { event } of students) {
    eventSelect.value = event.id;
    box.syncGuinnessRecordForm();
    fields['#recordRole'].value = 'teacher';
    box.syncGuinnessRecordForm();
    assert.equal(eventSelect.options.length, students.length);
    assert(eventSelect.options.every(option => option.value.startsWith('teacher-')), 'Teacher role must populate teacher options');
    assert.equal(eventSelect.value, 'teacher-' + event.id, 'Switching role must preserve the chosen sport');
    assert.equal(fields['#recordClassField'].style.display, 'none');
    assert.equal(fields['#recordResultLabel'].textContent, '挑战成绩（' + event.unit + '）');
    assert.equal(fields['#recordResult'].inputMode, event.input === 'duration' ? 'text' : 'decimal');
    assert.equal(fields['#recordResult'].value, '7.20');
    assert.equal(fields['#recordGender'].value, 'female');
    assert.equal(fields['#recordName'].value, ' 测试教师甲 ');
    assert.equal(fields['#recordDate'].value, '2026-11-24');
    fields['#recordRole'].value = 'student';
    box.syncGuinnessRecordForm();
    assert.equal(eventSelect.value, event.id);
    assert(eventSelect.options.every(option => !option.value.startsWith('teacher-')));
    assert.equal(fields['#recordClassField'].style.display, '');
    assert.equal(fields['#recordClass'].value, '9');
  }
  // Recover an empty selection left by the broken version, in either direction.
  for (const role of ['teacher', 'student']) {
    eventSelect.value = 'missing-event';
    fields['#recordRole'].value = role;
    box.syncGuinnessRecordForm();
    assert.equal(eventSelect.value, (role === 'teacher' ? 'teacher-' : '') + students[0].event.id);
  }
  fields['#recordRole'].value = 'teacher';
  box.syncGuinnessRecordForm();
  eventSelect.value = 'teacher-run-50m';
  box.syncGuinnessRecordForm();
  assert.equal(eventSelect.value, 'teacher-run-50m', 'Teacher can select a different project');
  await box.saveGuinnessRecord();
  const teacher = saved.at(-1).guinness.entries.at(-1);
  assert.equal(teacher.eventId, 'teacher-run-50m');
  assert.equal(teacher.isTeacher, true);
  assert.equal(teacher.classNo, 0);
  assert.equal(teacher.name, '测试教师甲');
  assert.equal(teacher.value, 7.2);
  assert.deepEqual(saved.at(-1).guinness.entries.slice(0, original.guinness.entries.length), original.guinness.entries);
  assert.deepEqual(saved.at(-1).matches, original.matches);
  const teacherEvent = box.guinnessEventMeta('teacher-run-50m').event;
  assert.equal(box.rankingEntries(teacherEvent, 'female').length, 1);
  assert.equal(box.rankingEntries(teacherEvent, 'male').length, 0);
  const panel = box.recordPanelHTML(teacherEvent, 'female');
  assert(panel.includes('测试教师甲'));
  assert(panel.includes('teacher-tag'));
  assert(!panel.includes('9班'));
  const studentEvent = box.guinnessEventMeta('run-50m').event;
  assert.equal(box.rankingEntries(studentEvent, 'female').length,
    original.guinness.entries.filter(entry => entry.eventId === 'run-50m' && entry.gender === 'female').length);

  fields['#recordRole'].value = 'student';
  const beforeMismatch = saved.length;
  await box.saveGuinnessRecord();
  assert.equal(saved.length, beforeMismatch, 'Do not save a teacher event with student identity');
  box.syncGuinnessRecordForm();
  fields['#recordRole'].value = 'teacher';
  await box.saveGuinnessRecord();
  assert.equal(saved.length, beforeMismatch, 'Do not save a student event with teacher identity');
  fields['#recordRole'].value = 'student';
  fields['#recordName'].value = '测试学生';
  await box.saveGuinnessRecord();
  const student = saved.at(-1).guinness.entries.at(-1);
  assert.equal(student.eventId, 'run-50m');
  assert.equal(student.isTeacher, false);
  assert.equal(student.classNo, 9);
  box.isAdmin = false;
  const beforeVisitor = saved.length;
  await box.saveGuinnessRecord();
  assert.equal(saved.length, beforeVisitor, 'Visitors cannot save');
  box.isAdmin = true;
  box.token = '';
  await box.saveGuinnessRecord();
  assert.equal(saved.length, beforeVisitor, 'A missing token cannot save');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'data/matches.json'), 'utf8')), original);
  console.log('PASS: all 19 projects switch both ways, empty-selection recovery, field preservation, separate rankings, in-memory teacher/student saving, identity guards. No live data changed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
