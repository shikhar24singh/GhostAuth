const fs=require('node:fs');
const path=require('node:path');
const dir=__dirname;
let source=fs.readFileSync(path.join(dir,'builder-source.js'),'utf8').replaceAll('Arial','Arimo').replaceAll('Courier New','Cousine');
const assets=JSON.parse(fs.readFileSync(path.join(dir,'builder.js'),'utf8').split('\n')[0].slice('const ASSETS='.length,-1));
delete assets.logo;
const assetCode='const ASSETS='+JSON.stringify(assets)+';\n';
source=source.replace("t.textStyleId=styles[style].id;", "t.fontSize=styles[style].fontSize;t.lineHeight=styles[style].lineHeight;t.letterSpacing=styles[style].letterSpacing;styleAssignments.push([t,styles[style].id]);");
source=source.replace("track(figma.createFrame())", "track(figma.createAutoLayout(horizontal?'HORIZONTAL':'VERTICAL'))");
source=source.replace("const image=figma.createImage(figma.base64Decode(ASSETS.logo));", "const image={hash:'43ac84d5663ecc011589f959301f0eaa29cbe51b'};");
source=source.replace("'brand','ink',180", "'brand','ink',180");
source=source.replace("const allCreated=[];", "const styleAssignments=[];const allCreated=[];");
source=source.replace("for(const [node,key] of links){if(!screens[key])", "for(const [node,key] of links){let owner=node;while(owner.parent&&owner.parent!==screenPage)owner=owner.parent;if(owner===screens[key])continue;if(!screens[key])");
const fontCode=source.slice(source.indexOf('  const fonts ='),source.indexOf('  const hex='));
const tokens=source.slice(source.indexOf('  const hex='),source.indexOf('  const screenPage='));
const helpers=source.slice(source.indexOf('  const styleAssignments='),source.indexOf('  function component('));
const components=source.slice(source.indexOf('  function component('),source.indexOf('  function instance('));
const body=source.slice(source.indexOf('  function instance('),source.indexOf('  const guide='));
const guide=source.slice(source.indexOf('  const guide='),source.indexOf('  const allScreens='));
const finish="for(const [n,id] of styleAssignments)await n.setTextStyleIdAsync(id);\n";
const foundation=assetCode+fontCode+`if(figma.currentPage.children.some(n=>n.type==='COMPONENT_SET'))throw Error('Components already built');\n`+tokens+`const componentPage=figma.currentPage;componentPage.name='02 — Components';const screenPage=figma.createPage();screenPage.name='01 — Android screens';const brandPage=figma.createPage();brandPage.name='03 — Brand & handoff';\n`+helpers+components+finish+`
const original=await figma.getNodeByIdAsync('7:2');if(original){original.name='Approved logo / source';original.x=560;original.y=80;original.resize(240,240);}
return {pages:{screens:screenPage.id,components:componentPage.id,brand:brandPage.id},buttons:Object.fromEntries(Object.entries(buttons).map(([k,v])=>[k,{id:v.c.id,key:v.key}])),rows:Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,{id:v.c.id,titleKey:v.titleKey,detailKey:v.detailKey}])),fields:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.id])),nav:Object.fromEntries(Object.entries(navComp).map(([k,v])=>[k,v.id])),header:header.id,menu:menu.id,variables:Object.fromEntries(Object.entries(token).map(([k,v])=>[k,v.id])),spacing:Object.fromEntries(Object.entries(spacing).map(([k,v])=>[k,v.id])),radius:radius.id,styles:Object.fromEntries(Object.entries(styles).map(([k,v])=>[k,v.id])),createdNodeIds:[screenPage.id,brandPage.id,...componentPage.findAll(()=>true).map(n=>n.id)],mutatedNodeIds:[componentPage.id,'7:2']};`;
fs.writeFileSync(path.join(dir,'direct-foundations.js'),foundation);
if(fs.existsSync(path.join(dir,'direct-state.json'))){
const S=JSON.parse(fs.readFileSync(path.join(dir,'direct-state.json'),'utf8'));
const context=assetCode+fontCode+`const S=${JSON.stringify(S)};const hex={paper:'#F5F4F0',ink:'#191919',cobalt:'#2448D8',stone:'#D8D6CF'};const rgb=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});const token={},spacing={},styles={};for(const [k,id]of Object.entries(S.variables))token[k]=await figma.variables.getVariableByIdAsync(id);for(const [k,id]of Object.entries(S.spacing))spacing[k]=await figma.variables.getVariableByIdAsync(id);for(const[k,id]of Object.entries(S.styles))styles[k]=await figma.getStyleByIdAsync(id);\n`+source.slice(source.indexOf('  const paint='),source.indexOf('  const styles='))+helpers;
const loadComponents=`const buttons={},rows={},fields={},navComp={};for(const[k,v]of Object.entries(S.buttons))buttons[k]={...v,c:await figma.getNodeByIdAsync(v.id)};for(const[k,v]of Object.entries(S.rows))rows[k]={...v,c:await figma.getNodeByIdAsync(v.id)};for(const[k,id]of Object.entries(S.fields))fields[k]=await figma.getNodeByIdAsync(id);for(const[k,id]of Object.entries(S.nav))navComp[k]=await figma.getNodeByIdAsync(id);const header=await figma.getNodeByIdAsync(S.header),menu=await figma.getNodeByIdAsync(S.menu);\n`;
fs.writeFileSync(path.join(dir,'direct-screens.js'),context+`const screenPage=await figma.getNodeByIdAsync(S.pages.screens);await figma.setCurrentPageAsync(screenPage);if(screenPage.children.length)throw Error('Screens already exist');\n`+loadComponents+body+finish+`return {screenIds:Object.fromEntries(Object.entries(screens).map(([k,n])=>[k,n.id])),screens:Object.values(screens).map(n=>({id:n.id,name:n.name,width:n.width,height:n.height})),links:links.length,instances:screenPage.findAllWithCriteria({types:['INSTANCE']}).length,createdNodeIds:screenPage.findAll(()=>true).map(n=>n.id),mutatedNodeIds:[screenPage.id]};`);
fs.writeFileSync(path.join(dir,'direct-brand.js'),context+`const brandPage=await figma.getNodeByIdAsync(S.pages.brand);await figma.setCurrentPageAsync(brandPage);if(brandPage.children.length)throw Error('Brand page already exists');\n`+guide+finish+`return {guideId:guide.id,createdNodeIds:brandPage.findAll(()=>true).map(n=>n.id),mutatedNodeIds:[brandPage.id]};`);
}
console.log('Prepared direct Figma scripts.');
