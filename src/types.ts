export interface Member {
  id: string;
  name: string;
  role?: string;
  status: string;
  phone?: string;
  email?: string;
  address?: string;
  birthDate?: string;
  baptismDate?: string;
  joinDate?: string;
  gender?: string;
  maritalStatus?: string;
  spouseName?: string;
  education?: string;
  profession?: string;
  groupCell?: string;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface Tithe {
  id: string;
  memberId: string;
  memberName: string;
  amount: number;
  date: string; // ISO date string or formatted date depending on what's used
  month: string;
  year?: number;
  referenceMonth?: string;
  referenceYear?: number;
  createdAt?: number;
  financialMonthId?: string;
}

export interface Offering {
  id: string;
  description: string;
  amount: number;
  date: string;
  month: string;
  financialMonthId?: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  month: string;
  financialMonthId?: string;
}

export interface FinancialMonth {
  id: string;
  month: string; // e.g. "Janeiro/2026"
  status: 'open' | 'closed';
  totalTithes: number;
  totalOfferings: number;
  totalExpenses: number;
  balance: number;
  openingBalance?: number;
}

export interface BuildingFund {
  id: string;
  type: 'contribuicao' | 'despesa';
  description: string;
  amount: number;
  date: string;
  memberId?: string;
  memberName?: string;
  month: string;
}

export interface Asset {
  id: string;
  name: string;
  category: string;
  quantity: number;
  value: number;
  purchaseDate: string;
  condition: string;
  location: string;
}

export interface DashboardStats {
  totalMembers: number;
  totalActive: number;
  totalInactive: number;
  thisMonthTithes: number;
  lastMonthTithes: number;
  genders: { name: string; value: number; fill: string }[];
  demographics: { name: string; value: number; fill: string }[];
  statusStats?: Record<string, { men: number; women: number }>;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  adminId: string;
  active: boolean;
}
