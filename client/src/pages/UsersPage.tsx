import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus, Pencil, Trash2, KeyRound, Loader2, Users } from "lucide-react";
import AppLayout from "@/components/AppLayout";

type UserRow = {
  id: number;
  username: string | null;
  name: string | null;
  email: string | null;
  role: "user" | "admin";
  createdAt: Date;
  lastSignedIn: Date;
};

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ username: "", password: "", name: "", email: "", role: "user" as "user" | "admin" });
  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => { toast.success("Usuário criado!"); utils.users.list.invalidate(); setForm({ username: "", password: "", name: "", email: "", role: "user" }); onClose(); },
    onError: (err) => toast.error(err.message),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Novo Usuário</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate({ ...form, email: form.email || undefined }); }} className="space-y-4 py-2">
          <div className="space-y-1.5"><Label>Nome completo *</Label><Input placeholder="Ex: João Silva" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div className="space-y-1.5"><Label>Usuário (login) *</Label><Input placeholder="Ex: joao.silva" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required /></div>
          <div className="space-y-1.5"><Label>Senha *</Label><Input type="password" placeholder="Mínimo 6 caracteres" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={6} /></div>
          <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" placeholder="email@empresa.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div className="space-y-1.5">
            <Label>Perfil *</Label>
            <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v as "user" | "admin" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Analista</SelectItem>
                <SelectItem value="admin">Coordenador / Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Criar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ name: user.name ?? "", email: user.email ?? "", role: user.role });
  const updateMutation = trpc.users.update.useMutation({
    onSuccess: () => { toast.success("Usuário atualizado!"); utils.users.list.invalidate(); onClose(); },
    onError: (err) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar — {user.username}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate({ userId: user.id, name: form.name, email: form.email || undefined, role: form.role }); }} className="space-y-4 py-2">
          <div className="space-y-1.5"><Label>Nome completo</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div className="space-y-1.5">
            <Label>Perfil</Label>
            <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v as "user" | "admin" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Analista</SelectItem>
                <SelectItem value="admin">Coordenador / Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const resetMutation = trpc.users.resetPassword.useMutation({
    onSuccess: () => { toast.success("Senha redefinida!"); onClose(); },
    onError: (err) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Redefinir Senha — {user.username}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label>Nova Senha</Label><Input type="password" placeholder="Mínimo 6 caracteres" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={6} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => resetMutation.mutate({ userId: user.id, newPassword })} disabled={newPassword.length < 6 || resetMutation.isPending}>{resetMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Redefinir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth({ redirectOnUnauthenticated: true });
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const utils = trpc.useUtils();
  const { data: users = [], isLoading } = trpc.users.list.useQuery();
  const deleteMutation = trpc.users.delete.useMutation({
    onSuccess: () => { toast.success("Usuário removido."); utils.users.list.invalidate(); setDeleteTarget(null); },
    onError: (err) => toast.error(err.message),
  });

  if (currentUser?.role !== "admin") {
    return <AppLayout><div className="flex items-center justify-center h-full p-8"><p className="text-gray-500">Acesso restrito ao Administrador.</p></div></AppLayout>;
  }
  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Usuários</h1>
              <p className="text-sm text-gray-500">Gerencie os acessos ao sistema</p>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2"><UserPlus className="w-4 h-4" />Novo Usuário</Button>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : users.length === 0 ? (
            <div className="text-center p-12 text-gray-400"><Users className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">Nenhum usuário cadastrado</p></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Usuário</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">E-mail</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Perfil</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Último acesso</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {(users as any[]).map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{u.username ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{u.email ?? "—"}</td>
                    <td className="px-4 py-3"><Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">{u.role === "admin" ? "Coordenador" : "Analista"}</Badge></td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleString("pt-BR") : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Editar" onClick={() => setEditUser(u)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Redefinir senha" onClick={() => setResetUser(u)}><KeyRound className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50" title="Remover" onClick={() => setDeleteTarget(u)} disabled={u.id === currentUser?.id}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <CreateUserModal open={showCreate} onClose={() => setShowCreate(false)} />
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário?</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja remover <strong>{deleteTarget?.name ?? deleteTarget?.username}</strong>? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteTarget && deleteMutation.mutate({ userId: deleteTarget.id })}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
