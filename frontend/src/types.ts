import type { WordsConfig } from "./wordsCanvas";
export type Author = {
  id: number;
  username: string;
  display_name: string;
  avatar: string | null;
};
export type Post = {
  type?: "pin" | "text_card";
  config?: WordsConfig | null;
  warnings?: string[];
  allow_download?: boolean;
  liked?: boolean;
  like_count?: number;
  moderation_status?: string;
  scan_id?: number | null;
  id: number;
  title: string;
  description: string;
  image: string;
  thumbnail: string;
  width: number;
  height: number;
  alt_text: string;
  source_url: string;
  tags: string[];
  owner: Author;
  created_at: string;
};
export type Comment = {
  liked?: boolean;
  like_count?: number;
  id: number;
  text: string;
  author: Author;
  created_at: string;
  updated_at: string;
};
export type Board = {
  id: number;
  name: string;
  description: string;
  is_private: boolean;
  owner: string;
  cover: string | null;
  cover_post_id: number | null;
  post_count: number;
};
export type Profile = Author & {
  is_guest?: boolean;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  bio: string;
  post_count: number;
  board_count: number;
};
export type Page<T> = {
  items: T[];
  next_cursor: string | null;
  total?: number;
};
