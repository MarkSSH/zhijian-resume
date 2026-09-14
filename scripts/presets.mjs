import {readFile} from 'node:fs/promises';
import {validate,clone} from '../app/model.js';
import {migrate} from '../app/format.js';

const presets = [
  {id:'blank', name:'空白简历', description:'从默认版式开始，填写自己的经历。'},
  {id:'demo', name:'演示简历 · 虚构内容', description:'体验内容块、科研成果与版式编辑；所有人物和经历均为虚构示例。'},
];

export const listPresets = () => presets.map(preset => ({...preset}));

export async function loadPreset(id = 'blank') {
  if (!presets.some(preset => preset.id === id)) throw new Error('预设不存在');
  const source = JSON.parse(await readFile(new URL(`../presets/${id}.json`, import.meta.url), 'utf8'));
  const data = migrate(clone(source));
  const errors = validate(data);
  if (errors.length) throw new Error(`预设 ${id} 格式不正确：${errors.join('；')}`);
  return data;
}
