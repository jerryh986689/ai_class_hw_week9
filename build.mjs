import { readFile, readdir, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'docs');
const relatedHeading = '後續影響';
const milestonesHeading = '重要節點';
const headings = ['研發背景', '關鍵設計', '成果與限制', milestonesHeading, relatedHeading, '資料來源'];
const required = ['name', 'country', 'manufacturer', 'role', 'milestone_date', 'milestone'];
const photoKeys = ['image', 'image_alt', 'image_credit', 'image_source', 'image_rights'];
const escape = (value) => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

const records = [];
for (const file of (await readdir(join(root, 'aircraft'))).filter(name => name.endsWith('.md'))) {
  const slug = file.slice(0, -3);
  const raw = (await readFile(join(root, 'aircraft', file), 'utf8')).replace(/\r\n/g, '\n');
  const match = raw.match(/^---\n([\s\S]+?)\n---\n([\s\S]+)$/);
  if (!match || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw Error(file + ' 檔名或格式錯誤');
  const data = Object.create(null);
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([a-z_]+): (.+)$/);
    if (!field || Object.hasOwn(data, field[1])) throw Error(file + ' 欄位格式錯誤或重複：' + line);
    if (![...required, 'first_flight', 'speed', 'speed_type', 'image_license', ...photoKeys].includes(field[1])) {
      throw Error(file + ' 未定義欄位：' + field[1]);
    }
    data[field[1]] = field[2].trim();
  }
  for (const key of required) if (!data[key]) throw Error(file + ' 缺少 ' + key);
  for (const date of [data.milestone_date, ...(data.first_flight ? [data.first_flight] : [])]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date) throw Error(file + ' 日期錯誤：' + date);
  }
  if (Boolean(data.speed) !== Boolean(data.speed_type)) throw Error(file + ' 速度與類型須成對');
  if (photoKeys.some(key => data[key])) {
    if (!photoKeys.every(key => data[key]) ||
        !/^(assets\/[a-z0-9-]+\.(jpg|jpeg|png|webp)|https:\/\/[^\s]+)$/.test(data.image) ||
        !/^https:\/\//.test(data.image_source)) throw Error(file + ' 照片欄位錯誤');
    if (data.image.startsWith('assets/')) await readFile(join(root, data.image));
  }
  if (data.image_license && (!data.image || !/^https:\/\/[^\s]+$/.test(data.image_license))) {
    throw Error(file + ' 照片授權網址錯誤');
  }
  const sections = [...match[2].matchAll(/^## (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)]
    .map(([, title, body]) => ({ title, body: body.trim() }));
  const expected = headings.filter(title => title !== relatedHeading || sections.some(section => section.title === title));
  if (sections.map(section => section.title).join('|') !== expected.join('|') ||
      sections.some(section => !section.body) || !/\[[^\]]+\]\(https:\/\/[^)]+\)/.test(sections.at(-1).body)) {
    throw Error(file + ' 正文章節順序、內容或來源有誤');
  }
  const milestones = sections.find(section => section.title === milestonesHeading).body.split('\n');
  if (milestones.length < 2 || milestones.some(line => !/^- \*\*[^*]+\*\*：.+\[[^\]]+\]\(https:\/\/[^)]+\)/.test(line))) {
    throw Error(file + ' 里程碑需至少兩項，每項須有日期、事件與來源');
  }
  records.push({ ...data, slug, sections });
}
if (!records.length) throw Error('至少需要一架機型');
records.sort((a, b) => a.milestone_date.localeCompare(b.milestone_date) || a.slug.localeCompare(b.slug));
const slugs = new Set(records.map(record => record.slug));

function inline(value) {
  return value.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g).map(part => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return '<strong>' + escape(part.slice(2, -2)) + '</strong>';
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!link) return escape(part);
    const [, label, url] = link;
    const internal = url.match(/^\.\.\/([a-z0-9-]+)\/$/);
    if (internal && !slugs.has(internal[1])) throw Error('站內連結找不到機型：' + url);
    if (!internal && !/^https:\/\/[^\s]+$/.test(url)) throw Error('連結格式錯誤：' + url);
    return '<a href="' + escape(url) + '">' + escape(label) + '</a>';
  }).join('');
}

function markdown(body) {
  body = body.replace(/^(### .+)\n(?!\n)/gm, '$1\n\n');
  return body.split(/\n\s*\n/).map(block => {
    const lines = block.split('\n');
    if (lines.length === 1 && block.startsWith('### ')) {
      return '<h3>' + escape(block.slice(4)) + '</h3>';
    }
    if (lines.every(line => line.startsWith('- '))) {
      return '<ul>' + lines.map(line => '<li>' + inline(line.slice(2)) + '</li>').join('') + '</ul>';
    }
    return '<p>' + inline(lines.join(' ')) + '</p>';
  }).join('\n');
}

function layout(title, prefix, content) {
  return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escape(title) + '</title><link rel="stylesheet" href="' + prefix +
    'assets/style.css"></head><body><main>' + content + '</main></body></html>\n';
}

function photo(record, prefix, thumbnail = false) {
  const src = record.image.startsWith('assets/') ? prefix + record.image : record.image;
  const alt = thumbnail ? '' : record.image_alt;
  return '<img src="' + escape(src) + '" alt="' + escape(alt) + '" decoding="async"' +
    (thumbnail ? ' loading="lazy"' : '') + '>';
}

const years = records[0].milestone_date.slice(0, 4) + '–' + records.at(-1).milestone_date.slice(0, 4);
const index = layout('高速飛行史', '', '<header class="overview"><p class="series">' + years +
  '</p><h1>高速飛行史</h1><p>從突破音障到低音爆研究，沿著年表看飛機怎麼飛得更快，以及高速飛行如何走進實際應用。</p></header>' +
  '<ol class="timeline" aria-label="高速飛行里程碑">' + records.map(record =>
    '<li id="' + record.slug + '"><a href="aircraft/' + record.slug +
    '/index.html"><time datetime="' + record.milestone_date + '">' + record.milestone_date.slice(0, 4) + '</time>' +
    '<span class="thumbnail">' + (record.image ? photo(record, '', true) : '') + '</span>' +
    '<span class="row-text"><strong>' + escape(record.name) + '</strong><span>' +
    escape(record.milestone) + '</span></span><span class="row-arrow" aria-hidden="true">↗</span></a></li>').join('') +
    '<li class="timeline-pending"><span aria-hidden="true">—</span><strong>待補充</strong></li></ol>');

const details = records.map((record, position) => {
  const facts = [['國家', record.country], ['製造商', record.manufacturer], ['用途', record.role],
    ['代表事件日期', record.milestone_date], ['首飛', record.first_flight], [record.speed_type, record.speed]];
  const adjacent = [[records[position - 1], '上一站'], [records[position + 1], '下一站']]
    .filter(([entry]) => entry)
    .map(([entry, label]) => '<a href="../' + entry.slug + '/index.html">' + label + ' · ' + escape(entry.name) + '</a>');
  return layout(record.name + '｜高速飛行史', '../../',
    '<nav><a href="../../index.html#' + record.slug + '">← 返回年表</a></nav>' +
    '<header><p class="series">' + escape(record.role) + '</p><h1>' + escape(record.name) + '</h1><p>' +
    escape(record.milestone) + '</p></header>' +
    (record.image ? '<figure>' + photo(record, '../../') + '<figcaption><a href="' + escape(record.image_source) +
      '">' + escape(record.image_credit) + '</a> · ' + (record.image_license ?
        '<a href="' + escape(record.image_license) + '">' + escape(record.image_rights) + '</a>' : escape(record.image_rights)) +
      ' · ' + escape(record.image_alt) + '</figcaption></figure>' : '') +
    '<dl>' + facts.filter(([, value]) => value).map(([label, value]) => '<div><dt>' + escape(label) +
      '</dt><dd>' + escape(value) + '</dd></div>').join('') + '</dl>' +
    record.sections.map(section => '<section' + (section.title === relatedHeading ? ' class="related"' :
      section.title === milestonesHeading ? ' class="milestones"' : '') +
      '><h2>' + escape(section.title) + '</h2>' +
      markdown(section.body).replace(/href="(\.\.\/[a-z0-9-]+\/)"/g, 'href="$1index.html"') + '</section>').join('') +
    (adjacent.length ? '<nav class="adjacent" aria-label="相鄰機型">' + adjacent.join('') + '</nav>' : ''));
});

await mkdir(join(output, 'assets'), { recursive: true });
await copyFile(join(root, 'assets', 'style.css'), join(output, 'assets', 'style.css'));
await writeFile(join(output, '.nojekyll'), '');
for (const [position, record] of records.entries()) {
  const page = join(output, 'aircraft', record.slug);
  await mkdir(page, { recursive: true });
  await writeFile(join(page, 'index.html'), details[position]);
  if (record.image?.startsWith('assets/')) await copyFile(join(root, record.image), join(output, record.image));
}
await writeFile(join(output, 'index.html'), index);
console.log('已產生 ' + records.length + ' 架機型與年表');
