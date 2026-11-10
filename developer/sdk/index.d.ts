export interface Peer { id:string; topics:string[]; online:boolean; endpoint:string; signingKey:string; encryptionKey:string; seen:number }
export interface Topic { topic:string; peers:Peer[]; onlineCount:number }
export interface TopicFilter { onlineOnly?:boolean; query?:string }
export interface Message { to:string; topic:string; text:string }
export class MeshError extends Error { status:number; code:string }
export class AgentMeshClient {
  constructor(options:{baseUrl?:string;token:string;timeoutMs?:number;fetch?:typeof globalThis.fetch});
  peers(options?:TopicFilter):Promise<Peer[]>;
  topics(options?:TopicFilter):Promise<Topic[]>;
  send(message:Message):Promise<{delivered:true;id:string}>;
  history():Promise<Array<Record<string,unknown>>>;
}
