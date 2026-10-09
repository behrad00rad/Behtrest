export type Author = {
  id: number;
  username: string;
  display_name: string;
  avatar: string | null;
};
export type Post = {
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
  bio: string;
  post_count: number;
  board_count: number;
};
export type Page<T> = { items: T[]; next_cursor: string | null };
