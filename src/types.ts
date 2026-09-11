export type ContractStatus =
  | 'draft'
  | 'pending_signature'
  | 'signed'
  | 'cancelled'
  | 'expired'

export type ContractTemplate = {
  id: string
  name: string
  content: string
  created_at: string
  updated_at: string
}

export type Contract = {
  id: string
  template_id: string | null
  content: string
  variables: Record<string, string>
  client_name: string
  client_email: string
  client_document: string | null
  status: ContractStatus
  external_id: string | null
  sign_url: string | null
  signed_at: string | null
  signed_file: string | null
  created_at: string
  updated_at: string
}

export type Database = {
  public: {
    Tables: {
      contract_templates: {
        Row: ContractTemplate
        Insert: Partial<ContractTemplate> & { name: string }
        Update: Partial<ContractTemplate>
        Relationships: []
      }
      contracts: {
        Row: Contract
        Insert: Partial<Contract> & {
          content: string
          client_name: string
          client_email: string
        }
        Update: Partial<Contract>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: { contract_status: ContractStatus }
    CompositeTypes: Record<string, never>
  }
}

export const STATUS_LABEL: Record<ContractStatus, string> = {
  draft: 'Rascunho',
  pending_signature: 'Aguardando assinatura',
  signed: 'Assinado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
}
