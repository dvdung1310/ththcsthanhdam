import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Eye, EyeOff, KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import { apiFetch } from "./api";
import "./PersonalProfile.css";

export default function PersonalProfile({ user, onUserChanged }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(user.avatar_url || "");
  const [avatar, setAvatar] = useState(null);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [error, setError] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const chooseAvatar = (event) => {
    const file = event.target.files?.[0];
    setError("");
    setAvatarMessage("");
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setError("Ảnh đại diện không được vượt quá 2 MB.");
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) return setError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.");
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setAvatar(file);
    setPreview(URL.createObjectURL(file));
  };

  const saveAvatar = async () => {
    if (!avatar) return setError("Vui lòng chọn ảnh đại diện mới.");
    setSavingAvatar(true); setError(""); setAvatarMessage("");
    try {
      const body = new FormData(); body.append("avatar", avatar);
      const response = await apiFetch("/api/auth/avatar", { method: "POST", body, headers: { Accept: "application/json" } });
      const payload = await response.json();
      if (!response.ok) throw new Error(Object.values(payload.errors || {}).flat()[0] || payload.message);
      onUserChanged(payload.user); setAvatar(null); setPreview(`${payload.user.avatar_url}?v=${Date.now()}`); setAvatarMessage(payload.message);
    } catch (e) { setError(e.message); } finally { setSavingAvatar(false); }
  };

  const changePassword = async (event) => {
    event.preventDefault(); setSavingPassword(true); setError(""); setPasswordMessage("");
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      const response = await apiFetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(data) });
      const payload = await response.json();
      if (!response.ok) throw new Error(Object.values(payload.errors || {}).flat()[0] || payload.message);
      form.reset(); setPasswordMessage(payload.message);
    } catch (e) { setError(e.message); } finally { setSavingPassword(false); }
  };

  return <div className="personal-page">
    <header className="personal-heading"><div><h2>Thông tin cá nhân</h2><p>Quản lý ảnh đại diện và bảo mật tài khoản của bạn</p></div><span><ShieldCheck size={18}/> Tài khoản được bảo vệ</span></header>
    {error && <div className="personal-alert error">{error}</div>}
    <div className="personal-grid">
      <section className="personal-card identity-card">
        <div className="personal-avatar-wrap">
          {preview ? <img src={preview} alt="Ảnh đại diện"/> : <span>{user.name.charAt(0)}</span>}
          <button type="button" onClick={() => fileRef.current?.click()} title="Chọn ảnh đại diện"><Camera size={19}/></button>
        </div>
        <h3>{user.name}</h3><p>{user.current_position || user.roles[0]?.name || "Người dùng"}</p>
        <div className="personal-info-row"><Mail size={17}/><span><small>Email đăng nhập</small><b>{user.email}</b></span></div>
        <div className="personal-info-row"><UserRound size={17}/><span><small>Chức vụ hiện tại</small><b>{user.current_position || "Chưa cập nhật"}</b></span></div>
        <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar}/>
        <button className="personal-upload" type="button" onClick={() => fileRef.current?.click()}><Camera size={17}/> Chọn ảnh mới</button>
        {avatar && <button className="personal-save" type="button" disabled={savingAvatar} onClick={saveAvatar}>{savingAvatar ? "Đang lưu..." : "Lưu ảnh đại diện"}</button>}
        {avatarMessage && <p className="personal-success"><CheckCircle2 size={15}/>{avatarMessage}</p>}
        <small className="avatar-note">JPG, PNG hoặc WebP · Tối đa 2 MB</small>
      </section>
      <section className="personal-card password-card">
        <div className="password-title"><span><KeyRound size={22}/></span><div><h3>Đổi mật khẩu</h3><p>Nên sử dụng mật khẩu mạnh và không dùng lại mật khẩu cũ</p></div></div>
        <form onSubmit={changePassword}>
          <label>Mật khẩu hiện tại<div className="password-input"><input name="current_password" type={showPasswords ? "text" : "password"} required autoComplete="current-password" placeholder="Nhập mật khẩu hiện tại"/></div></label>
          <label>Mật khẩu mới<div className="password-input"><input name="password" type={showPasswords ? "text" : "password"} required minLength="8" autoComplete="new-password" placeholder="Tối thiểu 8 ký tự"/></div></label>
          <label>Xác nhận mật khẩu mới<div className="password-input"><input name="password_confirmation" type={showPasswords ? "text" : "password"} required minLength="8" autoComplete="new-password" placeholder="Nhập lại mật khẩu mới"/><button type="button" onClick={() => setShowPasswords((value) => !value)} aria-label="Hiện hoặc ẩn mật khẩu">{showPasswords ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
          <div className="password-tips"><b>Mật khẩu an toàn nên:</b><span>• Có ít nhất 8 ký tự</span><span>• Kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt</span></div>
          <button className="personal-save password-submit" disabled={savingPassword}>{savingPassword ? "Đang cập nhật..." : "Cập nhật mật khẩu"}</button>
          {passwordMessage && <p className="personal-success"><CheckCircle2 size={15}/>{passwordMessage}</p>}
        </form>
      </section>
    </div>
  </div>;
}
