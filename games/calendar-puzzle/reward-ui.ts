import { GuiButton, GuiElement, GuiLabel, type GuiRoot } from '@haiyue/engine/gui';
import type { CalendarRewards } from './rewards';
import type { CalendarLanguage } from './locale';
import type { calendarLayout } from './viewport';

export const REWARD_COPY = {
  zh: { policy:'隐私政策', title:'提示次数', counts:'今日免费 / 已获奖励 / 今日可看广告', watch:'看广告 · 获得 1 次提示', use:'使用提示', buy:'解锁无限提示 · 无广告', close:'返回', privacy:'广告隐私选项', ready:'每天 1 次免费提示。看完广告再得 1 次', loading:'正在加载广告…', earned:'已获得 1 次提示，已为你保存', cancelled:'广告已关闭，未获得奖励', unavailable:'暂无可用广告，请稍后重试', offline:'网络不可用，请连接后重试', error:'暂时无法完成，请稍后重试', limit:'今日广告次数已用完，明天再来' },
  en: { policy:'Privacy Policy', title:'Hints', counts:'Free today / Reward credits / Ads left today', watch:'Watch ad · Get 1 hint', use:'Use hint', buy:'Unlimited hints · No ads', close:'Back', privacy:'Ad privacy options', ready:'1 free hint daily. Watch an ad for 1 more', loading:'Loading ad…', earned:'1 hint earned and saved', cancelled:'Ad closed. No reward earned', unavailable:'No ad available. Please try later', offline:'Offline. Reconnect and try again', error:'Could not complete. Please retry', limit:'Daily ad limit reached. Come back tomorrow' },
  ja: { policy:'プライバシーポリシー', title:'ヒント', counts:'本日の無料 / 獲得済み / 本日の広告残数', watch:'広告を見てヒントを1回獲得', use:'ヒントを使う', buy:'ヒント無制限 · 広告なし', close:'戻る', privacy:'広告のプライバシー設定', ready:'毎日無料で1回。広告視聴でもう1回', loading:'広告を読み込み中…', earned:'ヒントを1回獲得・保存しました', cancelled:'広告を閉じました。報酬はありません', unavailable:'広告がありません。後でお試しください', offline:'オフラインです。接続後に再試行してください', error:'完了できませんでした。再試行してください', limit:'本日の広告上限です。また明日' },
  fr: { policy:'Politique de confidentialité', title:'Indices', counts:'Gratuit / Récompenses / Publicités restantes', watch:'Voir une pub · 1 indice', use:'Utiliser un indice', buy:'Indices illimités · Sans pub', close:'Retour', privacy:'Confidentialité des pubs', ready:'1 indice gratuit par jour. Une pub = 1 indice', loading:'Chargement de la publicité…', earned:'1 indice obtenu et sauvegardé', cancelled:'Publicité fermée. Aucune récompense', unavailable:'Aucune publicité. Réessayez plus tard', offline:'Hors ligne. Reconnectez-vous', error:'Impossible de terminer. Réessayez', limit:'Limite atteinte. Revenez demain' },
  de: { policy:'Datenschutzerklärung', title:'Hinweise', counts:'Heute gratis / Guthaben / Verbleibende Werbung', watch:'Werbung ansehen · 1 Hinweis', use:'Hinweis nutzen', buy:'Unbegrenzt · Werbefrei', close:'Zurück', privacy:'Werbe-Datenschutz', ready:'1 Hinweis täglich gratis. Werbung = 1 weiterer', loading:'Werbung wird geladen…', earned:'1 Hinweis erhalten und gespeichert', cancelled:'Werbung geschlossen. Keine Belohnung', unavailable:'Keine Werbung verfügbar. Später versuchen', offline:'Offline. Bitte erneut verbinden', error:'Nicht abgeschlossen. Erneut versuchen', limit:'Tageslimit erreicht. Morgen geht es weiter' },
  es: { policy:'Política de privacidad', title:'Pistas', counts:'Gratis hoy / Recompensas / Anuncios restantes', watch:'Ver anuncio · 1 pista', use:'Usar pista', buy:'Pistas ilimitadas · Sin anuncios', close:'Volver', privacy:'Privacidad de anuncios', ready:'1 pista gratis al día. Un anuncio = 1 más', loading:'Cargando anuncio…', earned:'1 pista obtenida y guardada', cancelled:'Anuncio cerrado. Sin recompensa', unavailable:'No hay anuncios. Inténtalo más tarde', offline:'Sin conexión. Vuelve a conectarte', error:'No se pudo completar. Reintenta', limit:'Límite diario alcanzado. Vuelve mañana' },
} as const;
export const REWARD_GLYPHS = JSON.stringify(REWARD_COPY) + '∞0123456789';
export class CalendarRewardView {
  visible = false;
  private controls: GuiElement[] = [];
  private labels: Array<() => void> = [];
  private watch: GuiButton;
  private use: GuiButton;
  private buy: GuiButton;
  private close: GuiButton;
  constructor(private options: { root:GuiRoot; layout:()=>ReturnType<typeof calendarLayout>; language:()=>CalendarLanguage;
    rewards:CalendarRewards; close:()=>void; use:()=>void; buy:()=>void; register:(id:string,element:GuiElement)=>void }) {
    const place = <T extends GuiElement>(id:string,element:T,x:number,y:number,width:number,height:number) => {
      element.layout = () => { const l = options.layout(); element.rect = { x:(l.width-800)/2+x, y:(l.height-450)/2+y, width,height }; };
      this.controls.push(element); options.root.add(element); options.register(id,element); return element;
    };
    const backdrop = place('rewardBackdrop',new GuiElement({style:{backgroundColor:'rgba(22,51,47,0.35)',radius:0},onClick:()=>{}}),0,0,0,0);
    backdrop.layout = () => { const l=options.layout(); backdrop.rect={x:0,y:0,width:l.width,height:l.height}; };
    place('rewardPanel',new GuiElement({style:{backgroundColor:'#f8fcf9',radius:20}}),0,0,800,450);
    const label = (id:string,value:()=>string,y:number,size=22) => {
      const element=place(id,new GuiLabel({text:value(),textAlign:'center',style:{color:'#183c3b'}}),20,y,760,42);
      const layout=element.layout; element.layout=(r)=>{layout(r);element.setFontSize(size*options.layout().scale);};
      this.labels.push(()=>element.setText(value()));
    };
    const button=(id:string,value:()=>string,x:number,y:number,w:number,action:()=>void)=>{
      const element=place(id,new GuiButton({text:'',onClick:action}),x,y,w,58);
      const caption=place(id+'Text',new GuiLabel({text:value(),textAlign:'center',disabled:true,style:{color:'#183c3b'}}),x+12,y,w-24,58);
      const layout=caption.layout;
      caption.layout=r=>{
        layout(r);
        const units=[...value()].reduce((sum,char)=>sum+(/[\u2e80-\uffef]/u.test(char)?1:0.67),0);
        caption.setFontSize(Math.min(25,(w-24)/Math.max(1,units))*options.layout().scale);
      };
      this.labels.push(()=>{caption.setText(value());caption.setStyle({color:element.disabled?'#52716a':'#183c3b'});element.markDirty();}); return element;
    };
    label('rewardTitle',()=>this.copy.title,20,32);
    label('rewardCountsLabel',()=>this.copy.counts,78,20);
    label('rewardCounts',()=>{const s=options.rewards.snapshot();return s.unlimited?'∞':`${s.free}     /     ${s.credits}     /     ${s.adsRemaining}`;},116,28);
    label('rewardStatus',()=>this.copy[options.rewards.snapshot().phase],169,21);
    this.watch=button('rewardWatch',()=>this.copy.watch,35,231,445,()=>{void options.rewards.watch();});
    this.use=button('rewardUse',()=>this.copy.use,500,231,265,options.use);
    this.buy=button('rewardBuy',()=>this.copy.buy,35,321,445,options.buy);
    this.close=button('rewardClose',()=>this.copy.close,500,321,265,options.close);
    this.setVisible(false);
  }
  private get copy(){return REWARD_COPY[this.options.language()];}
  setVisible(visible:boolean):void {this.visible=visible;for(const c of this.controls)c.setVisible(visible);this.refresh();}
  refresh():void {
    const s=this.options.rewards.snapshot();
    this.watch.disabled=s.busy||s.unlimited||s.adsRemaining===0;
    this.use.disabled=s.busy||(!s.unlimited&&s.free+s.credits===0);
    this.buy.disabled=s.busy||s.unlimited;this.close.disabled=s.busy;
    for(const update of this.labels)update();
    for(const c of [this.watch,this.use,this.buy,this.close])c.markDirty();
  }
}
