export type TaskStatus =
  | 'available'
  | 'in_progress'
  | 'pending_verification'
  | 'completed'
  | 'rejected_verification';

export type AssignmentType = 'solo' | 'team' | 'org';

export interface Task {
  id: string;
  title: string;
  district: string;
  address: string;
  category: string;
  difficulty: number;
  rewardXp: number;
  status: TaskStatus;
  distance: string;
  members: string[];
  assignmentType?: AssignmentType;
  photoAfter?: string;
}

export const demoTasks: Task[] = [
  {
    id: '1',
    title: 'Пластик на березі біля Монастирського острова',
    district: 'Соборний р-н · 1.2 км',
    address: 'Набережна Перемоги, біля пішохідного мосту',
    category: 'Пластик',
    difficulty: 3,
    rewardXp: 150,
    status: 'available',
    distance: '1.2 км',
    members: [],
  },
  {
    id: '2',
    title: 'Будівельне сміття біля балки Тунельної',
    district: 'Шевченківський р-н · 3.1 км',
    address: 'Балка Тунельна, зелена зона',
    category: 'Будівельні відходи',
    difficulty: 4,
    rewardXp: 250,
    status: 'available',
    distance: '3.1 км',
    members: [],
  },
  {
    id: '3',
    title: 'Стихійне звалище біля Ботанічного саду',
    district: 'Соборний р-н · 2.9 км',
    address: 'Ботанічний сад, північний вхід',
    category: 'Змішані відходи',
    difficulty: 5,
    rewardXp: 400,
    status: 'available',
    distance: '2.9 км',
    members: [],
  },
  {
    id: '4',
    title: 'Пакети та пляшки на Ломівському пляжі',
    district: 'Індустріальний р-н · 4.0 км',
    address: 'Ломівський пляж, центральний вхід',
    category: 'Пластик',
    difficulty: 2,
    rewardXp: 100,
    status: 'available',
    distance: '4.0 км',
    members: [],
  },
  {
    id: '5',
    title: 'Прибирання парку Новокодацького',
    district: 'Новокодацький р-н · 5.2 км',
    address: 'Парк Новокодацький, центральна алея',
    category: 'Змішані відходи',
    difficulty: 3,
    rewardXp: 150,
    status: 'available',
    distance: '5.2 км',
    members: [],
  },
];

export const rewardForDifficulty: Record<number, number> = {
  1: 50,
  2: 100,
  3: 150,
  4: 250,
  5: 400,
};

export const statusLabel: Record<TaskStatus, string> = {
  available: 'Доступне',
  in_progress: 'Виконується',
  pending_verification: 'На перевірці',
  completed: 'Виконане',
  rejected_verification: 'Потрібне доопрацювання',
};
