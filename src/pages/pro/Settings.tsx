import { useState, useEffect } from 'react'
import {
  User,
  Loader2,
  Save,
  ShieldAlert,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { updateUser } from '@/services/api'
import { RatingStars } from '@/components/RatingStars'
import { getAvatarUrl } from '@/lib/avatar'
import {
  getProPaymentAccount,
  upsertProPaymentAccount,
  formatCPF,
  formatCNPJ,
  validateCPF,
  validateCNPJ,
  formatPixKey,
  validatePixKey,
  cleanDigits,
  ProPaymentAccount,
  DocType,
  PixKeyType,
} from '@/services/payouts'
import { getSettings, type PlatformSettings } from '@/services/settings'

export default function ProSettings() {
  const { user, role } = useAuth()
  const { toast } = useToast()

  // Profile state
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // Payment account state
  const [loadingAccount, setLoadingAccount] = useState(true)
  const [savingAccount, setSavingAccount] = useState(false)
  const [account, setAccount] = useState<ProPaymentAccount | null>(null)
  const [settings, setSettings] = useState<PlatformSettings | null>(null)

  const [holderName, setHolderName] = useState('')
  const [docType, setDocType] = useState<DocType>('cpf')
  const [docNumber, setDocNumber] = useState('')
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('cpf')
  const [pixKey, setPixKey] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAgency, setBankAgency] = useState('')
  const [bankAccount, setBankAccount] = useState('')

  // Validation errors
  const [docError, setDocError] = useState<string | null>(null)
  const [pixError, setPixError] = useState<string | null>(null)

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setPhone(user.phone || '')
      loadPaymentAccount(user.id)
    }
  }, [user])

  const loadPaymentAccount = async (userId: string) => {
    try {
      setLoadingAccount(true)
      const acc = await getProPaymentAccount(userId)
      if (acc) {
        setAccount(acc)
        setHolderName(acc.holder_name || '')
        setDocType((acc.doc_type as DocType) || 'cpf')
        setDocNumber(
          acc.doc_type === 'cnpj' ? formatCNPJ(acc.doc_number) : formatCPF(acc.doc_number),
        )
        setPixKeyType((acc.pix_key_type as PixKeyType) || 'cpf')
        setPixKey(acc.pix_key || '')
        setBankName(acc.bank_name || '')
        setBankAgency(acc.bank_agency || '')
        setBankAccount(acc.bank_account || '')
      } else if (user?.name) {
        // Pre-fill holder name with pro's name by default
        setHolderName(user.name)
      }
    } catch (err) {
      console.error('Erro ao carregar conta de pagamento:', err)
    } finally {
      setLoadingAccount(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!user) return
    setSavingProfile(true)
    try {
      await updateUser(user.id, { name, phone })
      toast({ title: 'Perfil atualizado', description: 'Suas informações foram salvas.' })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Não foi possível salvar.',
        variant: 'destructive',
      })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleDocNumberChange = (raw: string, type = docType) => {
    const formatted = type === 'cnpj' ? formatCNPJ(raw) : formatCPF(raw)
    setDocNumber(formatted)

    const digits = cleanDigits(formatted)
    if (type === 'cpf') {
      if (digits.length === 11 && !validateCPF(digits)) {
        setDocError('CPF inválido (verifique os dígitos).')
      } else {
        setDocError(null)
      }
    } else {
      if (digits.length === 14 && !validateCNPJ(digits)) {
        setDocError('CNPJ inválido (verifique os dígitos).')
      } else {
        setDocError(null)
      }
    }
  }

  const handleDocTypeChange = (newType: DocType) => {
    setDocType(newType)
    handleDocNumberChange(docNumber, newType)
    // If pixKeyType matches previous docType, optionally keep it aligned
    if (pixKeyType === 'cpf' || pixKeyType === 'cnpj') {
      setPixKeyType(newType)
    }
  }

  const handlePixKeyChange = (val: string, type = pixKeyType) => {
    const formatted = formatPixKey(type, val)
    setPixKey(formatted)
    if (type !== 'none' && formatted.trim()) {
      const v = validatePixKey(type, formatted)
      setPixError(v.valid ? null : v.error || 'Chave Pix inválida.')
    } else {
      setPixError(null)
    }
  }

  const handlePixKeyTypeChange = (newType: PixKeyType) => {
    setPixKeyType(newType)
    if (newType === 'none') {
      setPixKey('')
      setPixError(null)
    } else {
      handlePixKeyChange(pixKey, newType)
    }
  }

  const handleSavePaymentAccount = async () => {
    if (!user) return

    if (!holderName.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome do titular da conta/chave.',
        variant: 'destructive',
      })
      return
    }

    const docDigits = cleanDigits(docNumber)
    if (docType === 'cpf') {
      if (!validateCPF(docDigits)) {
        setDocError('CPF inválido.')
        toast({
          title: 'Documento inválido',
          description: 'Por favor, informe um CPF válido.',
          variant: 'destructive',
        })
        return
      }
    } else {
      if (!validateCNPJ(docDigits)) {
        setDocError('CNPJ inválido.')
        toast({
          title: 'Documento inválido',
          description: 'Por favor, informe um CNPJ válido.',
          variant: 'destructive',
        })
        return
      }
    }

    if (pixKeyType !== 'none') {
      const vPix = validatePixKey(pixKeyType, pixKey)
      if (!vPix.valid) {
        setPixError(vPix.error || 'Chave Pix inválida.')
        toast({
          title: 'Chave Pix inválida',
          description: vPix.error || 'Verifique a chave informada.',
          variant: 'destructive',
        })
        return
      }
    }

    setSavingAccount(true)
    try {
      const updated = await upsertProPaymentAccount(user.id, {
        holder_name: holderName.trim(),
        doc_type: docType,
        doc_number: docDigits,
        pix_key_type: pixKeyType,
        pix_key: pixKeyType === 'none' ? '' : pixKey.trim(),
        bank_name: bankName.trim(),
        bank_agency: bankAgency.trim(),
        bank_account: bankAccount.trim(),
      })
      setAccount(updated)
      toast({
        title: 'Conta enviada para verificação',
        description:
          'Seus dados de recebimento foram salvos com sucesso e serão analisados pela nossa equipe.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar conta',
        description: err?.message || 'Não foi possível salvar os dados de recebimento.',
        variant: 'destructive',
      })
    } finally {
      setSavingAccount(false)
    }
  }

  const avg = Number(user?.rating_avg || 0)
  const count = Number(user?.rating_count || 0)
  const guaranteeDays = settings?.guarantee_period_days ?? 1
  const guaranteeText = guaranteeDays === 1 ? '24h' : `${guaranteeDays} dias`

  return (
    <div className="space-y-8 max-w-3xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie seu perfil público e dados de recebimento.</p>
      </div>

      {/* Profile summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Perfil
          </CardTitle>
          <CardDescription>Como os clientes veem você na plataforma.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <img
              src={getAvatarUrl(user, 128)}
              alt="Avatar"
              className="w-16 h-16 rounded-full border bg-muted object-cover"
            />
            <div className="space-y-1">
              <p className="font-semibold text-lg">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <RatingStars avg={avg} count={count} size="md" />
            </div>
          </div>

          {user?.suspended && (
            <div className="flex items-start gap-2 p-4 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">
              <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Conta suspensa</p>
                <p>
                  Sua conta está suspensa por excesso de cancelamentos ou notas baixas. Entre em
                  contato com o suporte para reativação.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pro-name">Nome</Label>
              <Input id="pro-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pro-phone">Telefone</Label>
              <Input
                id="pro-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>

          <Button onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" /> Salvar alterações
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Payment Account Section (role === 'pro') */}
      {role === 'pro' && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" /> Conta de recebimento
                </CardTitle>
                <CardDescription>
                  Dados bancários e chave Pix para receber os repasses dos serviços prestados.
                </CardDescription>
              </div>
              {account && (
                <div>
                  {account.status === 'verified' && (
                    <Badge className="bg-green-100 text-green-800 border-green-300 flex items-center gap-1.5 hover:bg-green-100">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                      Verificada
                    </Badge>
                  )}
                  {account.status === 'pending' && (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300 flex items-center gap-1.5 hover:bg-amber-100">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      Pendente de verificação
                    </Badge>
                  )}
                  {account.status === 'rejected' && (
                    <Badge className="bg-red-100 text-red-800 border-red-300 flex items-center gap-1.5 hover:bg-red-100">
                      <XCircle className="h-3.5 w-3.5 text-red-600" />
                      Rejeitada
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Informational banner */}
            <div className="flex items-start gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50/70 text-blue-900 text-sm">
              <Info className="h-5 w-5 mt-0.5 text-blue-600 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">Repasses automáticos via Pix</p>
                <p className="text-blue-800 text-xs sm:text-sm">
                  O repasse dos seus serviços é enviado para esta conta via Pix após a janela de
                  garantia de {guaranteeText}.
                </p>
              </div>
            </div>

            {/* Rejection notice if any */}
            {account?.status === 'rejected' && (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 bg-red-50 text-red-900 text-sm">
                <XCircle className="h-5 w-5 mt-0.5 text-red-600 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">Conta rejeitada</p>
                  <p className="text-xs sm:text-sm">
                    {account.reviewer_note ||
                      'Os dados informados não puderam ser verificados. Corrija as informações abaixo para reanálise.'}
                  </p>
                </div>
              </div>
            )}

            {loadingAccount ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando conta de recebimento...
              </div>
            ) : (
              <div className="space-y-4">
                {/* Holder Name */}
                <div className="space-y-2">
                  <Label htmlFor="pro-holder-name">
                    Nome do Titular <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="pro-holder-name"
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                    placeholder="Nome completo ou Razão Social do titular"
                  />
                  <p className="text-xs text-muted-foreground">
                    O titular da conta bancária ou chave Pix deve corresponder ao titular do
                    documento.
                  </p>
                </div>

                {/* Doc Type + Doc Number */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="pro-doc-type">
                      Tipo de Documento <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={docType}
                      onValueChange={(val: DocType) => handleDocTypeChange(val)}
                    >
                      <SelectTrigger id="pro-doc-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cpf">CPF (Pessoa Física)</SelectItem>
                        <SelectItem value="cnpj">CNPJ (Pessoa Jurídica / MEI)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="pro-doc-number">
                      Número do {docType.toUpperCase()} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="pro-doc-number"
                      value={docNumber}
                      onChange={(e) => handleDocNumberChange(e.target.value)}
                      placeholder={docType === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
                      className={docError ? 'border-red-500' : ''}
                    />
                    {docError && <p className="text-xs text-red-600 font-medium">{docError}</p>}
                  </div>
                </div>

                {/* Pix Key Type + Pix Key */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="pro-pix-type">Tipo de Chave Pix</Label>
                    <Select
                      value={pixKeyType}
                      onValueChange={(val: PixKeyType) => handlePixKeyTypeChange(val)}
                    >
                      <SelectTrigger id="pro-pix-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cpf">CPF</SelectItem>
                        <SelectItem value="cnpj">CNPJ</SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="phone">Telefone (com DDD)</SelectItem>
                        <SelectItem value="random">Chave Aleatória (EVP)</SelectItem>
                        <SelectItem value="none">Não utilizar Pix</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {pixKeyType !== 'none' && (
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="pro-pix-key">
                        Chave Pix <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="pro-pix-key"
                        value={pixKey}
                        onChange={(e) => handlePixKeyChange(e.target.value)}
                        placeholder={
                          pixKeyType === 'cpf'
                            ? '000.000.000-00'
                            : pixKeyType === 'cnpj'
                              ? '00.000.000/0000-00'
                              : pixKeyType === 'email'
                                ? 'exemplo@dominio.com'
                                : pixKeyType === 'phone'
                                  ? '(00) 00000-0000'
                                  : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
                        }
                        className={pixError ? 'border-red-500' : ''}
                      />
                      {pixError && <p className="text-xs text-red-600 font-medium">{pixError}</p>}
                    </div>
                  )}
                </div>

                {/* Optional Bank Fallback Details */}
                <div className="pt-2 border-t">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Dados Bancários Tradicionais (Opcional / Fallback)
                  </p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="pro-bank-name">Banco / Instituição</Label>
                      <Input
                        id="pro-bank-name"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="Ex: Nubank, Itaú, Bradesco"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pro-bank-agency">Agência</Label>
                      <Input
                        id="pro-bank-agency"
                        value={bankAgency}
                        onChange={(e) => setBankAgency(e.target.value)}
                        placeholder="Ex: 0001"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pro-bank-account">Conta (com dígito)</Label>
                      <Input
                        id="pro-bank-account"
                        value={bankAccount}
                        onChange={(e) => setBankAccount(e.target.value)}
                        placeholder="Ex: 12345-6"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button onClick={handleSavePaymentAccount} disabled={savingAccount}>
                    {savingAccount ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando conta...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" /> Salvar conta de recebimento
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground text-center">
        Suas avaliações recebidas são moderadas pela administração. A sua nota média continua
        visível no seu perfil público.
      </p>
    </div>
  )
}
