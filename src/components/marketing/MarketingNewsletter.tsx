import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Send, Upload, Eye, Users, FileEdit, History } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface Contact {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  unsubscribed: boolean;
  created_at: string;
}

interface Broadcast {
  id: string;
  subject: string;
  html_content: string;
  resend_broadcast_id: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
}

async function invokeNewsletter(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("newsletter-manage", {
    body: { action, ...extra },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export const MarketingNewsletter = () => {
  const [tab, setTab] = useState("subscribers");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Nyhetsbrev</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="subscribers" className="gap-1"><Users className="w-3.5 h-3.5" /> Abonnenter</TabsTrigger>
          <TabsTrigger value="compose" className="gap-1"><FileEdit className="w-3.5 h-3.5" /> Skriv</TabsTrigger>
          <TabsTrigger value="history" className="gap-1"><History className="w-3.5 h-3.5" /> Historikk</TabsTrigger>
        </TabsList>
        <TabsContent value="subscribers"><SubscribersTab /></TabsContent>
        <TabsContent value="compose"><ComposeTab /></TabsContent>
        <TabsContent value="history"><HistoryTab /></TabsContent>
      </Tabs>
    </div>
  );
};

/* ─── Subscribers ─── */
const SubscribersTab = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invokeNewsletter("list-contacts");
      setContacts(res?.data ?? []);
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addContact = async () => {
    if (!email) return;
    try {
      await invokeNewsletter("add-contact", { email, first_name: firstName, last_name: lastName });
      toast({ title: "Lagt til" });
      setEmail(""); setFirstName(""); setLastName("");
      load();
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    }
  };

  const removeContact = async (id: string) => {
    try {
      await invokeNewsletter("remove-contact", { contact_id: id });
      toast({ title: "Fjernet" });
      load();
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    }
  };

  const importContacts = async () => {
    const emails = importText.split(/[,;\n]+/).map(e => e.trim()).filter(Boolean);
    if (!emails.length) return;
    try {
      const res = await invokeNewsletter("import-contacts", { emails });
      const ok = res.imported?.filter((r: any) => r.ok).length ?? 0;
      toast({ title: `Importert ${ok} av ${emails.length} kontakter` });
      setImportText("");
      setShowImport(false);
      load();
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    }
  };

  const subscribed = contacts.filter(c => !c.unsubscribed);
  const unsubscribed = contacts.filter(c => c.unsubscribed);

  return (
    <div className="space-y-4 mt-2">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[150px]"><Label className="text-xs">E-post</Label><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="e@post.no" /></div>
        <div className="min-w-[100px]"><Label className="text-xs">Fornavn</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
        <div className="min-w-[100px]"><Label className="text-xs">Etternavn</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} /></div>
        <Button size="sm" onClick={addContact}><Plus className="w-4 h-4 mr-1" />Legg til</Button>
        <Button size="sm" variant="outline" onClick={() => setShowImport(!showImport)}><Upload className="w-4 h-4 mr-1" />Importer</Button>
      </div>

      {showImport && (
        <div className="space-y-2 p-3 border border-border rounded-md bg-muted/30">
          <Label className="text-xs">Lim inn e-poster (komma-, semikolon- eller linjeskilt)</Label>
          <Textarea value={importText} onChange={e => setImportText(e.target.value)} rows={3} placeholder="a@b.no, c@d.no" />
          <Button size="sm" onClick={importContacts}>Importer alle</Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{subscribed.length} aktive abonnenter{unsubscribed.length > 0 && `, ${unsubscribed.length} avmeldt`}</p>
          <div className="rounded-md border overflow-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-post</TableHead>
                  <TableHead className="hidden sm:table-cell">Navn</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs">{c.email}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.unsubscribed ? "secondary" : "default"} className="text-[10px]">
                        {c.unsubscribed ? "Avmeldt" : "Aktiv"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeContact(c.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {contacts.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-6">Ingen kontakter enda</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
};

/* ─── Compose ─── */
const ComposeTab = () => {
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState(`<h1>Nyhetsbrev</h1>\n<p>Innhold her...</p>\n<p style="font-size:12px;color:#999;">Du mottar dette fordi du abonnerer på vårt nyhetsbrev.</p>\n<p>{{{RESEND_UNSUBSCRIBE_URL}}}</p>`);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);

  const sendNow = async () => {
    if (!subject || !html) {
      toast({ title: "Fyll ut emne og innhold", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const broadcast = await invokeNewsletter("create-broadcast", { subject, html });
      await invokeNewsletter("send-broadcast", { broadcast_id: broadcast.id });
      toast({ title: "Nyhetsbrev sendt!" });
      setSubject("");
      setHtml("");
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <div>
        <Label>Emne</Label>
        <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Emne for nyhetsbrevet" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>HTML-innhold</Label>
          <Button size="sm" variant="ghost" onClick={() => setPreview(!preview)}>
            <Eye className="w-4 h-4 mr-1" />{preview ? "Rediger" : "Forhåndsvis"}
          </Button>
        </div>
        {preview ? (
          <div className="border border-border rounded-md p-4 bg-white min-h-[200px]" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <Textarea value={html} onChange={e => setHtml(e.target.value)} rows={12} className="font-mono text-xs" />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Tips: Inkluder <code className="bg-muted px-1 rounded">{`{{{RESEND_UNSUBSCRIBE_URL}}}`}</code> i HTML-en for automatisk avmeldingslenke.
      </p>
      <div className="flex gap-2">
        <Button onClick={sendNow} disabled={sending}>
          {sending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
          Send nå
        </Button>
      </div>
    </div>
  );
};

/* ─── History ─── */
const HistoryTab = () => {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await invokeNewsletter("list-broadcasts");
        setBroadcasts(res ?? []);
      } catch (e: any) {
        toast({ title: "Feil", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="mt-2">
      {broadcasts.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Ingen sendte nyhetsbrev enda</p>
      ) : (
        <div className="rounded-md border overflow-auto max-h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Emne</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sendt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="text-sm font-medium">{b.subject}</TableCell>
                  <TableCell>
                    <Badge variant={b.status === "sent" ? "default" : "secondary"} className="text-[10px]">{b.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {b.sent_at ? format(new Date(b.sent_at), "dd. MMM yyyy HH:mm", { locale: nb }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
