import { useState, useEffect } from 'react'
import { MapPin, Plus, Trash2, Loader2, Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import {
  getSavedLocations,
  createSavedLocation,
  updateSavedLocation,
  deleteSavedLocation,
  type SavedLocation,
} from '@/services/locations'

export default function ClientLocations() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [locations, setLocations] = useState<SavedLocation[]>([])
  const [loading, setLoading] = useState(true)

  const [label, setLabel] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editAddress, setEditAddress] = useState('')

  const load = async () => {
    if (!user) return
    try {
      const list = await getSavedLocations(user.id)
      setLocations(list)
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os locais.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [user])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !label.trim() || !address.trim()) return
    setSaving(true)
    try {
      await createSavedLocation({
        client_id: user.id,
        label: label.trim(),
        address: address.trim(),
      })
      toast({ title: 'Local salvo', description: 'Você poderá usá-lo ao solicitar um serviço.' })
      setLabel('')
      setAddress('')
      load()
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar o local.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteSavedLocation(id)
      toast({ title: 'Local removido' })
      load()
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível remover.', variant: 'destructive' })
    }
  }

  const startEdit = (loc: SavedLocation) => {
    setEditingId(loc.id)
    setEditLabel(loc.label)
    setEditAddress(loc.address)
  }

  const handleSaveEdit = async (id: string) => {
    if (!editLabel.trim() || !editAddress.trim()) return
    try {
      await updateSavedLocation(id, { label: editLabel.trim(), address: editAddress.trim() })
      setEditingId(null)
      load()
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível atualizar.', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Locais Salvos</h1>
        <p className="text-muted-foreground">
          Gerencie os endereços que você usa com frequência ao solicitar serviços.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> Novo Local
          </CardTitle>
          <CardDescription>Adicione um apelido e o endereço completo.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="loc-label">Apelido</Label>
                <Input
                  id="loc-label"
                  placeholder="Ex.: Matriz, Filial Centro..."
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc-address">Endereço</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="loc-address"
                    className="pl-9"
                    placeholder="Rua, Número, Bairro, Cidade"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                'Salvar Local'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-bold mb-4">Meus Locais</h2>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...
          </div>
        ) : locations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <MapPin className="h-10 w-10 mx-auto mb-3 opacity-40" />
              Nenhum local salvo ainda. Adicione o primeiro acima.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {locations.map((loc) => (
              <Card key={loc.id}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="bg-primary/10 p-2 rounded-lg mt-0.5">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  {editingId === loc.id ? (
                    <div className="flex-1 space-y-2">
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        placeholder="Apelido"
                      />
                      <Input
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        placeholder="Endereço"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleSaveEdit(loc.id)}>
                          <Check className="h-4 w-4 mr-1" /> Salvar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4 mr-1" /> Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1">
                      <p className="font-semibold">{loc.label}</p>
                      <p className="text-sm text-muted-foreground">{loc.address}</p>
                    </div>
                  )}
                  {editingId !== loc.id && (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(loc)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(loc.id)}
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
