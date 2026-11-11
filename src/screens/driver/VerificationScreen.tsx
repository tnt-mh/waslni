import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNavigate } from 'react-router-dom';
import { Camera, Car, CheckCircle2, Clock, FileImage, Plus, ShieldCheck, Trash2, Upload, XCircle } from 'lucide-react';
import { Screen, useToast } from '../../components/feedback';
import { ScreenHeader } from '../../components/AppShell';
import { Badge, Banner, Button, Card, Field, Input, Progress, Select } from '../../components/ui';
import { useStore, currentUser, getVerification } from '../../lib/store';
import { compressImage } from '../../lib/utils';
import { useI18n } from '../../i18n';
import type { DocumentKind } from '../../lib/types';

const KINDS: DocumentKind[] = ['id_card', 'license', 'registration', 'selfie'];

export function VerificationScreen() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const me = useStore(currentUser)!;
  const verification = useStore((s) => getVerification(s, me.id));
  const documents = useStore(useShallow((s) => s.documents.filter((d) => d.userId === me.id)));
  const vehicles = useStore(useShallow((s) => s.vehicles.filter((v) => v.ownerId === me.id)));
  const saveDocument = useStore((s) => s.saveDocument);
  const removeDocument = useStore((s) => s.removeDocument);
  const submitVerification = useStore((s) => s.submitVerification);
  const addVehicle = useStore((s) => s.addVehicle);

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [year, setYear] = useState('2020');
  const [plate, setPlate] = useState('');
  const [vSeats, setVSeats] = useState('3');
  const [vError, setVError] = useState('');

  const locked = verification.status === 'pending' || verification.status === 'verified';
  const uploadedKinds = KINDS.filter((k) => documents.some((d) => d.kind === k));
  const progress = (uploadedKinds.length / KINDS.length) * 100;

  const onFile = async (kind: DocumentKind, file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast(t('verify.docTooBig'), 'error');
    try {
      const dataUrl = await compressImage(file);
      const res = saveDocument({ kind, imageDataUrl: dataUrl, fileName: file.name });
      if (!res.ok) toast(t(res.error), 'error');
      else toast(t('common.saved'), 'success');
    } catch {
      toast(t('error.cameraUnavailable'), 'error');
    }
  };

  const submit = () => {
    const res = submitVerification();
    if (!res.ok) return toast(t(res.error), 'error');
    toast(t('verify.submitted'), 'success');
  };

  const saveVehicle = () => {
    setVError('');
    if (!brand.trim() || !model.trim()) return setVError(t('common.required'));
    if (!/^\d{4,6}\s?\d{3}\s?\d{2}$/.test(plate.trim())) return setVError(t('verify.invalidPlate'));
    const y = Number(year);
    const s = Number(vSeats);
    if (!Number.isFinite(y) || y < 1980 || y > new Date().getFullYear() + 1) return setVError(t('common.error'));
    if (!Number.isFinite(s) || s < 1 || s > 7) return setVError(t('common.error'));
    const res = addVehicle({ brand: brand.trim(), model: model.trim(), color: color.trim() || '—', year: y, plate: plate.trim(), seats: s });
    if (!res.ok) return setVError(t(res.error));
    setVehicleOpen(false);
    setBrand(''); setModel(''); setColor(''); setPlate('');
    toast(t('verify.vehicleSaved'), 'success');
  };

  const statusIcon = verification.status === 'verified' ? <CheckCircle2 size={16} /> : verification.status === 'pending' ? <Clock size={16} /> : verification.status === 'rejected' ? <XCircle size={16} /> : <ShieldCheck size={16} />;
  const statusVariant = verification.status === 'verified' ? 'success' : verification.status === 'pending' ? 'warning' : verification.status === 'rejected' ? 'error' : 'neutral';

  return (
    <Screen>
      <ScreenHeader title={t('verify.title')} />
      <div className="screen-body stagger">
        <div className="row between">
          <span className="subtitle">{t('verify.subtitle')}</span>
        </div>
        <Badge variant={statusVariant as 'success'}>{statusIcon} {t(`verify.status.${verification.status}`)}</Badge>

        {verification.status === 'rejected' && verification.reason && (
          <Banner kind="error"><span className="bold">{t('verify.reason')} :</span> {verification.reason}</Banner>
        )}
        {verification.status === 'pending' && <Banner kind="warning">{t('driver.pendingReviewText')}</Banner>}
        {verification.status === 'verified' && <Banner kind="success">{t('driver.verified')}</Banner>}

        <Card className="col gap-8">
          <div className="row between"><span className="small bold">{t('verify.progress')}</span><span className="tiny muted">{uploadedKinds.length}/4</span></div>
          <Progress value={progress} />
        </Card>

        {KINDS.map((kind) => {
          const doc = documents.find((d) => d.kind === kind);
          return (
            <Card key={kind} className="col gap-10">
              <div className="row between">
                <span className="small bold">{t(`verify.${kind === 'id_card' ? 'idCard' : kind}`)}</span>
                {doc && <Badge variant="success"><CheckCircle2 size={10} /> {t('verify.preview')}</Badge>}
              </div>
              {doc ? (
                <>
                  <img className="doc-thumb" src={doc.imageDataUrl} alt={t(`verify.${kind === 'id_card' ? 'idCard' : kind}`)} />
                  {!locked && (
                    <div className="row gap-8">
                      <Button variant="outline" size="sm" block onClick={() => fileRefs.current[kind]?.click()}><Upload size={14} /> {t('verify.replace')}</Button>
                      <Button variant="danger-ghost" size="sm" onClick={() => removeDocument(kind)}><Trash2 size={14} /></Button>
                    </div>
                  )}
                </>
              ) : (
                <button className="upload-tile" disabled={locked} onClick={() => fileRefs.current[kind]?.click()}>
                  <FileImage size={26} />
                  {t('verify.upload')}
                </button>
              )}
              <input
                ref={(el) => { fileRefs.current[kind] = el; }}
                type="file" accept="image/*" hidden
                onChange={(e) => { onFile(kind, e.target.files?.[0]); e.target.value = ''; }}
              />
              {!doc && !locked && (
                <Button variant="ghost" size="sm" onClick={() => {
                  const input = fileRefs.current[kind];
                  if (input) { input.setAttribute('capture', 'environment'); input.click(); input.removeAttribute('capture'); }
                }}>
                  <Camera size={14} /> {t('verify.camera')}
                </Button>
              )}
            </Card>
          );
        })}

        {!locked && (
          <Button block size="lg" disabled={uploadedKinds.length < 4} onClick={submit}>
            <ShieldCheck size={17} /> {t('verify.submit')}
          </Button>
        )}
        {verification.status === 'rejected' && (
          <Button block variant="secondary" onClick={submit} disabled={uploadedKinds.length < 4}>{t('driver.resubmit')}</Button>
        )}

        <Banner kind="info"><ShieldCheck size={15} /> {t('verify.securityNote')}</Banner>

        <div className="section-title"><h2>{t('verify.vehicleInfo')}</h2></div>
        {vehicles.map((v) => (
          <Card key={v.id} className="row gap-12">
            <span className="empty-icon" style={{ width: 42, height: 42, margin: 0 }}><Car size={19} /></span>
            <span className="col grow" style={{ gap: 2 }}>
              <span className="small bold">{v.brand} {v.model} · {v.color}</span>
              <span className="tiny muted">{v.year} · {v.plate} · {v.seats} {t('common.seats')}</span>
            </span>
          </Card>
        ))}
        {!vehicleOpen ? (
          <Button variant="outline" block onClick={() => setVehicleOpen(true)}><Plus size={16} /> {t('verify.addVehicle')}</Button>
        ) : (
          <Card className="col gap-12">
            <div className="row gap-8">
              <Field label={t('verify.brand')}><Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Renault" /></Field>
              <Field label={t('verify.model')}><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Clio 4" /></Field>
            </div>
            <div className="row gap-8">
              <Field label={t('verify.color')}><Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Blanche" /></Field>
              <Field label={t('verify.year')}><Input type="number" value={year} onChange={(e) => setYear(e.target.value)} /></Field>
            </div>
            <Field label={t('verify.plate')} error={vError}>
              <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder={t('verify.platePlaceholder')} />
            </Field>
            <Field label={t('verify.seats')}>
              <Select value={vSeats} onChange={(e) => setVSeats(e.target.value)}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            <div className="row gap-8">
              <Button variant="outline" block onClick={() => setVehicleOpen(false)}>{t('common.cancel')}</Button>
              <Button block onClick={saveVehicle}>{t('common.save')}</Button>
            </div>
          </Card>
        )}
        <Button variant="ghost" block onClick={() => navigate('/driver')}>{t('common.back')}</Button>
      </div>
    </Screen>
  );
}