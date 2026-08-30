require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME";

const dataDir = path.join(__dirname, "data");
const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(dataDir, {recursive:true});
fs.mkdirSync(uploadDir, {recursive:true});

const db = new Database(path.join(dataDir, "cartunix.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 credits INTEGER NOT NULL DEFAULT 0,
 role TEXT NOT NULL DEFAULT 'user',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings(
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 amount INTEGER NOT NULL,
 credits INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 transaction_id TEXT,
 screenshot TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tickets(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 message TEXT NOT NULL,
 attachment TEXT,
 status TEXT NOT NULL DEFAULT 'pending',
 admin_reply TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS creations(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 type TEXT NOT NULL,
 prompt TEXT,
 input_file TEXT,
 output_url TEXT,
 status TEXT NOT NULL DEFAULT 'queued',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const defaults = {
 brand:"Cartunix Zx",
 welcome_credits:"100",
 pack_49:"49",
 pack_199:"199",
 pack_499:"499",
 instagram:"https://www.instagram.com/cartunix_zx",
 facebook:"https://www.facebook.com/share/1DCWAvbqsG/",
 youtube:"https://youtube.com/@cartunixzx",
 whatsapp:"https://wa.me/916306390971",
 qr_url:"/payment_qr.jpg"
};
for (const [k,v] of Object.entries(defaults))
  db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)").run(k,v);

function settings(){
  return Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map(x=>[x.key,x.value]));
}
function tokenFor(u){ return jwt.sign({id:u.id,role:u.role,email:u.email},JWT_SECRET,{expiresIn:"7d"}); }
function auth(req,res,next){
  const h=req.headers.authorization||"";
  if(!h.startsWith("Bearer ")) return res.status(401).json({error:"Login required"});
  try { req.user=jwt.verify(h.slice(7),JWT_SECRET); next(); }
  catch(e){ return res.status(401).json({error:"Invalid or expired session"}); }
}
function admin(req,res,next){ if(req.user.role!=="admin") return res.status(403).json({error:"Admin only"}); next(); }

const upload = multer({
  dest: uploadDir,
  limits:{fileSize:100*1024*1024},
  fileFilter:(req,file,cb)=>{
    const ok=/^(image|video|audio)\//.test(file.mimetype);
    cb(ok?null:new Error("Only image, video or audio files are allowed"),ok);
  }
});

app.use(cors());
app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));
app.use("/uploads",express.static(uploadDir));
app.use(express.static(path.join(__dirname,"public")));

app.get("/api/settings",(req,res)=>res.json(settings()));

app.post("/api/auth/signup",async(req,res)=>{
  const {name,email,password}=req.body||{};
  if(!name||!email||!password||password.length<6) return res.status(400).json({error:"Name, email and 6+ character password required"});
  try{
    const hash=await bcrypt.hash(password,12);
    const s=settings();
    const r=db.prepare("INSERT INTO users(name,email,password_hash,credits) VALUES(?,?,?,?)")
      .run(name,email.toLowerCase(),hash,Number(s.welcome_credits));
    const u=db.prepare("SELECT id,name,email,credits,role FROM users WHERE id=?").get(r.lastInsertRowid);
    res.json({token:tokenFor(u),user:u});
  }catch(e){res.status(400).json({error:"Email already registered"});}
});

app.post("/api/auth/login",async(req,res)=>{
  const {email,password}=req.body||{};
  const u=db.prepare("SELECT * FROM users WHERE email=?").get((email||"").toLowerCase());
  if(!u || !(await bcrypt.compare(password||"",u.password_hash))) return res.status(401).json({error:"Invalid login"});
  res.json({token:tokenFor(u),user:{id:u.id,name:u.name,email:u.email,credits:u.credits,role:u.role}});
});

app.get("/api/me",auth,(req,res)=>{
  const u=db.prepare("SELECT id,name,email,credits,role FROM users WHERE id=?").get(req.user.id);
  res.json(u);
});

app.post("/api/upload",auth,upload.single("file"),(req,res)=>{
  if(!req.file) return res.status(400).json({error:"File missing"});
  res.json({url:"/uploads/"+req.file.filename,name:req.file.originalname,type:req.file.mimetype});
});

app.post("/api/tickets",auth,upload.single("attachment"),(req,res)=>{
  const message=(req.body.message||"").trim();
  if(!message) return res.status(400).json({error:"Describe the problem"});
  const r=db.prepare("INSERT INTO tickets(user_id,message,attachment) VALUES(?,?,?)")
    .run(req.user.id,message,req.file?"/uploads/"+req.file.filename:null);
  res.json({id:r.lastInsertRowid,status:"pending"});
});

app.get("/api/tickets",auth,(req,res)=>{
  const rows=req.user.role==="admin"
    ? db.prepare("SELECT t.*,u.email,u.name FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC").all()
    : db.prepare("SELECT * FROM tickets WHERE user_id=? ORDER BY id DESC").all(req.user.id);
  res.json(rows);
});

app.post("/api/admin/tickets/:id",auth,admin,(req,res)=>{
  const {status,reply}=req.body||{};
  db.prepare("UPDATE tickets SET status=?,admin_reply=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(status||"in_progress",reply||"",req.params.id);
  res.json({ok:true});
});

app.post("/api/admin/settings",auth,admin,(req,res)=>{
  const allowed=["brand","welcome_credits","pack_49","pack_199","pack_499","instagram","facebook","youtube","whatsapp","qr_url"];
  const tx=db.transaction((body)=>{
    for(const k of allowed) if(body[k]!==undefined)
      db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k,String(body[k]));
  });
  tx(req.body||{});
  res.json(settings());
});

app.post("/api/admin/qr",auth,admin,upload.single("qr"),(req,res)=>{
  if(!req.file) return res.status(400).json({error:"QR image required"});
  const ext=path.extname(req.file.originalname)||".jpg";
  const dest=path.join(__dirname,"public","payment_qr"+ext);
  fs.copyFileSync(req.file.path,dest);
  db.prepare("INSERT INTO settings(key,value) VALUES('qr_url',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run("/payment_qr"+ext);
  res.json({qr_url:"/payment_qr"+ext});
});

/* Manual payment record. For automatic payment verification, connect a gateway
   webhook and verify its signature on the server before adding credits. */
app.post("/api/orders",auth,(req,res)=>{
  const amount=Number(req.body.amount);
  const allowed=[49,199,499];
  if(!allowed.includes(amount)) return res.status(400).json({error:"Invalid pack"});
  const credits=amount===49?50:amount===199?220:600;
  const r=db.prepare("INSERT INTO orders(user_id,amount,credits,transaction_id) VALUES(?,?,?,?)")
    .run(req.user.id,amount,credits,req.body.transaction_id||null);
  res.json({order_id:r.lastInsertRowid,status:"pending",message:"Payment submitted for verification"});
});

app.get("/api/admin/orders",auth,admin,(req,res)=>{
  res.json(db.prepare("SELECT o.*,u.email,u.name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC").all());
});
app.post("/api/admin/orders/:id/approve",auth,admin,(req,res)=>{
  const o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if(!o || o.status==="approved") return res.status(400).json({error:"Invalid order"});
  const tx=db.transaction(()=>{
    db.prepare("UPDATE orders SET status='approved' WHERE id=?").run(o.id);
    db.prepare("UPDATE users SET credits=credits+? WHERE id=?").run(o.credits,o.user_id);
  });
  tx();
  res.json({ok:true});
});

/* AI provider adapters. The keys stay server-side; add your chosen provider
   endpoint/key in .env and implement its request format here. */
app.post("/api/ai/script",auth,async(req,res)=>{
  res.json({status:"provider_required",message:"AI Script provider API को .env में configure करें।"});
});
app.post("/api/ai/image",auth,async(req,res)=>{
  res.json({status:"provider_required",message:"AI Image provider API को .env में configure करें।"});
});
app.post("/api/ai/video",auth,async(req,res)=>{
  res.json({status:"provider_required",message:"AI Video provider API को .env में configure करें।"});
});
app.post("/api/ai/voice",auth,async(req,res)=>{
  res.json({status:"provider_required",message:"AI Voice provider API को .env में configure करें।"});
});
app.get("/{*splat}", (req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT,()=>console.log(`Cartunix Zx running on http://localhost:${PORT}`));
