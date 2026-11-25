import {MapPackLibrary,validPackLibrary,type PackLibrarySave} from '../editor/map-pack-library';
import {packArea,unpackArea,type PackedArea} from '../levels/classic-codec';
import {validate,type Level} from '../rules/model';

export type DocumentIdentity={kind:'standalone'}|{kind:'course';pack:string;course:string};
export interface DocumentSave {kind:'whale-maker-session';version:1;library:PackLibrarySave;active:DocumentIdentity;level?:PackedArea}
export type CompatibleDocumentSave=DocumentSave|PackLibrarySave;
export function isDocumentSave(value:CompatibleDocumentSave):value is DocumentSave {return 'kind'in value&&value.kind==='whale-maker-session';}
export function validDocumentSave(value:unknown):value is CompatibleDocumentSave {
    try{
        const save=value as DocumentSave;if(!save||save.kind!=='whale-maker-session')return validPackLibrary(value);
        if(save.version!==1||!validPackLibrary(save.library)||!save.active)return false;
        if(save.active.kind==='standalone'){validate(unpackArea(save.level));return true;}
        return save.active.kind==='course'&&typeof save.active.pack==='string'&&typeof save.active.course==='string';
    }catch{return false;}
}
function courseOrFallback(library:MapPackLibrary,preferred?:DocumentIdentity):Extract<DocumentIdentity,{kind:'course'}>{
    const packs=library.list(),pack=packs.find(p=>preferred?.kind==='course'&&p.id===preferred.pack)??packs[0]!;
    const course=pack.courses.find(c=>preferred?.kind==='course'&&c.id===preferred.course)??pack.courses[0]!;
    return {kind:'course',pack:pack.id,course:course.id};
}
export function saveDocument(library:MapPackLibrary,active:DocumentIdentity,level:Level):DocumentSave {
    return {kind:'whale-maker-session',version:1,library:library.snapshot(),active:active.kind==='course'?courseOrFallback(library,active):active,
        ...(active.kind==='standalone'?{level:packArea(validate(level))}:{})};
}
/** All decoding/validation is isolated; the caller commits only after creating State. */
export function prepareDocument(save:CompatibleDocumentSave|null,preferred?:DocumentIdentity,legacyLevel?:Level|null){
    const library=new MapPackLibrary();
    if(save)library.restore(isDocumentSave(save)?save.library:save);
    const saved=save&&isDocumentSave(save)?save:null;
    if(saved?.active.kind==='standalone')return {library,active:saved.active,level:validate(unpackArea(saved.level))};
    if(!saved&&(!save||!isDocumentSave(save)&&save.packs.length===0)&&legacyLevel)return {library,active:{kind:'standalone'} as const,level:validate(legacyLevel)};
    const active=courseOrFallback(library,saved?.active??preferred);
    return {library,active,level:library.level(active.pack,active.course)};
}
