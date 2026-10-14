import React,{useRef,useState} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {ArrowUpRight} from 'lucide-react';
import south from './assets/campuses/south.webp';
import newCampus from './assets/campuses/new.webp';
import main from './assets/campuses/main.webp';
import railway from './assets/campuses/railway.webp';
import xiangyaNew from './assets/campuses/xiangya-new.webp';
import xiangyaOld from './assets/campuses/xiangya-old.webp';

const folders=[
 {name:'南校区',image:south,position:'50% 52%'},
 {name:'新校区',image:newCampus,position:'50% 58%'},
 {name:'校本部',image:main,position:'50% 52%'},
 {name:'铁道校区',image:railway,position:'50% 52%'},
 {name:'湘雅新校区',image:xiangyaNew,position:'50% 60%'},
 {name:'湘雅老校区',image:xiangyaOld,position:'50% 66%'},
];

// Warm the six small, versioned assets once, without competing with feed images.
const warmedImages=typeof Image==='undefined'?[]:folders.map(folder=>{
 const image=new Image();
 image.fetchPriority='low';
 image.decoding='async';
 image.src=folder.image;
 return image;
});

export default function CampusFolders({onSelect}){
 const reduced=useReducedMotion(),locked=useRef(false),[selected,setSelected]=useState(null);
 const choose=name=>{if(locked.current)return;locked.current=true;if(reduced){onSelect(name);return;}setSelected(name);};
 return <section className="subpage campus-page"><div className="page-title"><h1>逛校园</h1></div>
  <div className="folder-stack" aria-label="选择校区" aria-busy={selected!==null}>
   {folders.map((folder,index)=>{
    const active=selected===folder.name;
    return <motion.button key={folder.name} type="button" className={'campus-folder'+(active?' is-opening':'')}
     aria-label={'浏览'+folder.name+'闲置'} aria-disabled={selected!==null} onClick={()=>choose(folder.name)}
     style={{'--folder-index':index,zIndex:active?20:index+1}}
     initial={false} animate={{y:active?-64:0,scale:active?1.015:1}}
     whileHover={!selected&&!reduced?{y:-9}:undefined} whileFocus={!selected&&!reduced?{y:-9}:undefined}
     transition={{duration:reduced?0:active?.4:.2,ease:[.22,1,.36,1]}}
     onAnimationComplete={()=>{if(active)onSelect(folder.name);}}>
     <span className="folder-surface" aria-hidden="true"><img src={folder.image} alt="" width="720" height="440" decoding="async" style={{objectPosition:folder.position}} draggable="false"/><span className="folder-label-surface"/></span>
     <span className="folder-tab"><span>{folder.name}</span><ArrowUpRight size={17} strokeWidth={1.8}/></span>
    </motion.button>;
   })}
  </div>
 </section>;
}
