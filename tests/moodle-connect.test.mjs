import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  safeMoodleEndpoint,
  configReady,
  authorizationURL,
  normalizeMoodleCourses,
  planCourseImport,
  pkceChallenge,
} from '../js/moodle-connect-core.js';

const config = {
  origin: 'https://moodle.ucas.edu.ps',
  clientId: 'client_1234',
  authorizePath: '/oauth/authorize',
  tokenPath: '/oauth/token',
  coursesPath: '/api/rest/v2/course/courses',
  scopes: 'core_course:course:read',
};

test('OAuth client is disabled by default without university registration', () => {
  assert.equal(configReady({ ...config, clientId: '' }), false);
  assert.equal(configReady(config), true);
});

test('Moodle endpoints do not permit arbitrary hosts, credentials or query redirects', () => {
  assert.equal(safeMoodleEndpoint('//evil.example/x'), null);
  assert.equal(safeMoodleEndpoint('/foo?next=https://evil.example'), null);
  assert.equal(safeMoodleEndpoint('https://evil.example/x'), null);
  assert.equal(
    safeMoodleEndpoint('/api/rest/v2/course/courses'),
    'https://moodle.ucas.edu.ps/api/rest/v2/course/courses',
  );
});

test('OAuth uses Authorization Code, state and PKCE S256', () => {
  const u = new URL(
    authorizationURL(
      config,
      'https://mmashharawi2021-cell.github.io/UCAS/moodle-connect.html',
      's123',
      'c456',
    ),
  );
  assert.equal(u.origin, config.origin);
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('state'), 's123');
  assert.ok(!u.searchParams.has('password'));
});

test('PKCE challenge matches SHA-256 test vector', async () => {
  const v = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert.equal(await pkceChallenge(v), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('Courses are filtered, deduplicated and do not overwrite manual classes', () => {
  const courses = normalizeMoodleCourses({
    courses: [
      { id: 15, fullname: 'GIS إدارة مشاريع', shortname: 'GISS 4301' },
      { id: 15, fullname: 'Duplicated' },
      { id: 23, fullname: 'استشعار عن بعد' },
      { id: 'bad', fullname: 'Invalid' },
    ],
  });
  assert.equal(courses.length, 2);
  const additions = planCourseImport(courses, [
    { id: 'course-1', title: 'GIS إدارة مشاريع', code: 'GISS 4301' },
  ]);
  assert.deepEqual(
    additions.map(x => x.moodleId),
    ['23'],
  );
});

test('Connector never collects Moodle passwords or persists tokens', () => {
  const s = readFileSync('js/moodle-connect.js', 'utf8');
  assert.doesNotMatch(s, /localStorage\.setItem|put\('settings',.*token|password\s*:/);
  assert.match(s, /sessionStorage\.setItem\(PENDING/);
  assert.match(s, /authorization_code/);
  assert.match(s, /visibility|document\.hidden/);
});
