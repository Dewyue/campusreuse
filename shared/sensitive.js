const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};

/** Patterns that usually leak contact or lodging details into C2C text. */
const RULES=[
 {re:/1[3-9]\d{9}/,hint:'手机号'},
 {re:/(?:微信|微信号|v信|vx[:：\s]?|weixin|wechat)\s*[:：]?\s*[a-zA-Z][\w-]{4,}/i,hint:'微信号'},
 {re:/(?:加我|私聊|私信).{0,8}(?:微信|qq|电话|手机)/i,hint:'站外联系方式'},
 {re:/\b(?:qq|QQ)[:：\s]?\d{5,12}\b/,hint:'QQ 号'},
 {re:/\d{17}[\dXx]/,hint:'疑似身份证号'},
 {re:/(?:宿舍|寝室|宿舍楼).{0,12}(?:\d{1,4}\s*(?:栋|号楼|舍)|[一二三四五六七八九十]\s*栋)/,hint:'宿舍房间信息'},
 {re:/\d{1,4}\s*号床/,hint:'宿舍床位信息'},
];

export function assertNoSensitive(value,field='内容'){
 const text=typeof value==='string'?value:'';
 for(const rule of RULES){
  if(rule.re.test(text))fail(`请勿在${field}中填写${rule.hint}；请用平台沟通，面交选校内公共地点`);
 }
 return text;
}

export function scanSensitive(...parts){
 for(const part of parts)assertNoSensitive(part);
}
