export interface Book {
  cover_url: string | undefined;
  id: string;
  title: string;
  author: string;
  file_path: string;
  cover_path?: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface FilterContent {
  words?: string[];
  phrases?: string[];
  sections?: {
    end: string;
    start: string;
    replacement: string | null;
  }[];
}

export interface BookPosition {
  id: string;
  book_id: string;
  user_id: string;
  position: string;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: 'active' | 'inactive' | 'past_due' | 'canceled';
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}