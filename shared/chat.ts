export interface ChatItem {
  id: number;
  title: string;
  campus: string;
  price: number;
  image: string;
  photo?: string;
  pickupPlace?: string;
  pickupWindow?: string;
  isMine?: boolean;
  isDemo?: boolean;
  availability?: string;
}
export interface ChatMessage {
  id: number;
  mine: boolean;
  kind: 'text' | 'place';
  text: string;
  createdAt: string;
}
export interface Conversation {
  id: number;
  item: ChatItem;
  role: 'buyer' | 'seller';
  peer: string;
  peerId?: number;
  unread: number;
  lastText: string;
  updatedAt: string;
}
export interface MessagePage {
  conversation: Conversation;
  messages: ChatMessage[];
  hasMore: boolean;
}
export type ChatApi = <T>(path: string, options?: RequestInit) => Promise<T>;
