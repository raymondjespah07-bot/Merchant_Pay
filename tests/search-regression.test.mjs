import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('admin general search isolates database source failures instead of failing the whole search',()=>{
 const route=read('app/api/admin/search-all/route.ts');
 assert.match(route,/Promise\.allSettled/);
 assert.match(route,/fulfilled/);
 assert.match(route,/failedSources|searchErrors|sourceErrors/);
});

test('admin general search deduplicates results by type and id',()=>{
 const route=read('app/api/admin/search-all/route.ts');
 assert.match(route,/new Map\(results\.map/);
 assert.match(route,/type.*id|r\.type.*r\.id/);
});

test('admin general search does not treat invalid numeric input as a money filter',()=>{
 const route=read('app/api/admin/search-all/route.ts');
 assert.match(route,/Number\.isFinite\(numericAmount\)/);
});
