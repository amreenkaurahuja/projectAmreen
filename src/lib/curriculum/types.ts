export type CurriculumTopic = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sort_order: number;
  skills: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    difficulty: number;
  }>;
};

export type CurriculumSubject = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
  topics?: CurriculumTopic[];
};
