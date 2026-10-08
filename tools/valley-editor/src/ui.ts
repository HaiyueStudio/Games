import { defineTabsComponents, type HYTabs } from '@haiyue/ui/tabs';
export type { HYTabs };
import { defineButtonComponents, type HYButton } from '@haiyue/ui/button';
import { defineInputComponents } from '@haiyue/ui/input';
import { defineSelectComponents } from '@haiyue/ui/select';
import { defineDialogComponents } from '@haiyue/ui/dialog';
import { defineSplitComponents } from '@haiyue/ui/split';
export type { HYInput, HYInputType } from '@haiyue/ui/input';
export type { HYSelect } from '@haiyue/ui/select';
export type { HYDialog } from '@haiyue/ui/dialog';
export type { HYSplit } from '@haiyue/ui/split';
export type { HYButton } from '@haiyue/ui/button';

defineButtonComponents();defineInputComponents();defineSelectComponents();defineDialogComponents();defineSplitComponents();defineTabsComponents();

export function button(text:string,action:()=>void):HYButton {
  const control=document.createElement('hy-button') as HYButton;
  control.textContent=text;control.addEventListener('click',()=>{if(!control.hasAttribute('disabled'))action();});return control;
}
export function editingControl(target:EventTarget|null):boolean {
  return target instanceof HTMLElement&&(target.matches('hy-input,hy-select,input,select,textarea')||target.isContentEditable);
}
export function editingFocus():boolean {
  let active:Element|null=document.activeElement;
  while(active){if(editingControl(active))return true;active=active.shadowRoot?.activeElement??null;}
  return false;
}
