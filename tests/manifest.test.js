import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.json',import.meta.url)));
test('content execution is limited to desktop YouTube HTTPS pages',()=>{
 assert.equal(manifest.manifest_version,3);
 assert.deepEqual(manifest.content_scripts.flatMap(c=>c.matches),['https://www.youtube.com/*']);
 assert.deepEqual(manifest.permissions,['storage','contextMenus']);
 assert.deepEqual(manifest.host_permissions,['https://openrouter.ai/*','https://www.youtube.com/*']);
 assert.equal(manifest.content_scripts.some(c=>c.all_frames),false);
 assert.equal(manifest.externally_connectable,undefined);
 assert.equal(manifest.web_accessible_resources,undefined);
});
test('all extension entry points are present and local',()=>{
 const paths=[manifest.background.service_worker,manifest.options_page,manifest.action.default_popup,...manifest.content_scripts.flatMap(c=>[...c.js,...c.css])];
 for(const p of paths){assert.ok(!p.includes('://'));assert.ok(fs.existsSync(new URL('../'+p,import.meta.url)),p)}
});

test('toolbar opens a local popup with no broad tab or scripting permission',()=>{
 assert.equal(manifest.action.default_popup,'src/popup.html');
 assert.equal(manifest.name.includes('\u2014'),false);
 assert.equal(manifest.permissions.includes('tabs'),false);
 assert.equal(manifest.permissions.includes('activeTab'),false);
 assert.equal(manifest.permissions.includes('scripting'),false);
});

test('reminder dialog loads before the content controller',()=>{
 const scripts=manifest.content_scripts[0].js;
 assert.ok(scripts.includes('src/reminder-dialog.js'));
 assert.ok(scripts.indexOf('src/reminder-dialog.js')<scripts.indexOf('src/content.js'));
});
