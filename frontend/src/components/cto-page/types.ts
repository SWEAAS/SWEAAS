export interface TavusReplica {
  replica_id: string;
  replica_name: string;
  thumbnail_video_url: string;
  model_name: string;
  poster_image_url?: string | null;
}

export interface CircularGalleryItem {
  id: string;
  text: string;
  image?: string;
  mediaUrl?: string;
  kind?: "replica" | "action";
}
