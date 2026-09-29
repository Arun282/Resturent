const express=require("express");
const cors=require("cors");
const fs=require("fs");
const path=require("path");

const app=express();
const PORT=process.env.PORT||10000;
const DATA=path.join(__dirname,"data.json");
const ADMIN_USER=process.env.ADMIN_USER||"aroh097";
const ADMIN_PASS=process.env.ADMIN_PASS||"Arun@123";

// Optional persistent GitHub storage.
// Set GITHUB_TOKEN (fine-grained Contents: Read and write) and GITHUB_REPO=Arun282/Resturent on Render.
const GITHUB_TOKEN=process.env.GITHUB_TOKEN||"";
const GITHUB_REPO=process.env.GITHUB_REPO||"Arun282/Resturent";
const GITHUB_PATH=process.env.GITHUB_DATA_PATH||"data.json";
const GITHUB_BRANCH=process.env.GITHUB_BRANCH||"main";
const githubEnabled=Boolean(GITHUB_TOKEN);

app.use(cors());
app.use(express.json({limit:"8mb"}));

const defaultMenu=[
{id:1,name:"Butter Chicken",price:260,img:"https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80"},
{id:2,name:"Paneer Tikka",price:220,img:"https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=800&q=80"},
{id:3,name:"Veg Biryani",price:180,img:"https://images.unsplash.com/photo-1563379091339-03246963d96c?auto=format&fit=crop&w=800&q=80"},
{id:4,name:"Masala Dosa",price:140,img:"https://images.unsplash.com/photo-1630383249896-424e482df921?auto=format&fit=crop&w=800&q=80"}
];

let db={menu:defaultMenu,orders:[],customers:[],settings:{name:"My Restaurant",logo:""}};
let dataSha=null;
let saveQueue=Promise.resolve();

function normalize(){
  db=db&&typeof db==="object"?db:{};
  db.menu=Array.isArray(db.menu)?db.menu:defaultMenu;
  db.orders=Array.isArray(db.orders)?db.orders:[];
  db.customers=Array.isArray(db.customers)?db.customers:[];
  db.settings={name:db.settings?.name||"My Restaurant",logo:db.settings?.logo||""};
}

async function githubGet(){
  const r=await fetch("https://api.github.com/repos/"+GITHUB_REPO+"/contents/"+GITHUB_PATH+"?ref="+encodeURIComponent(GITHUB_BRANCH),{
    headers:{Authorization:"Bearer "+GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10"}
  });
  if(r.status===404)return null;
  if(!r.ok)throw new Error("GitHub read failed: "+r.status);
  const x=await r.json();
  dataSha=x.sha;
  return JSON.parse(Buffer.from(x.content.replace(/\n/g,""),"base64").toString("utf8"));
}

async function githubSave(){
  const body=JSON.stringify(db,null,2);
  const payload={message:"Update restaurant data",content:Buffer.from(body).toString("base64"),branch:GITHUB_BRANCH};
  if(dataSha)payload.sha=dataSha;
  const r=await fetch("https://api.github.com/repos/"+GITHUB_REPO+"/contents/"+GITHUB_PATH,{
    method:"PUT",
    headers:{Authorization:"Bearer "+GITHUB_TOKEN,Accept:"application/vnd.github+json","Content-Type":"application/json","X-GitHub-Api-Version":"2026-03-10"},
    body:JSON.stringify(payload)
  });
  if(!r.ok)throw new Error("GitHub save failed: "+r.status+" "+await r.text());
  const x=await r.json();
  dataSha=x.content?.sha||dataSha;
}

function save(){
  saveQueue=saveQueue.then(async()=>{
    if(githubEnabled){
      await githubSave();
    }else{
      fs.writeFileSync(DATA,JSON.stringify(db,null,2));
    }
  }).catch(e=>console.error(e));
  return saveQueue;
}

async function load(){
  if(githubEnabled){
    try{
      const remote=await githubGet();
      if(remote)db=remote;
      else await githubSave();
    }catch(e){
      console.error("GitHub storage unavailable:",e.message);
      if(fs.existsSync(DATA))db=JSON.parse(fs.readFileSync(DATA,"utf8"));
    }
  }else if(fs.existsSync(DATA)){
    try{db=JSON.parse(fs.readFileSync(DATA,"utf8"))}catch(e){console.error(e)}
  }
  normalize();
}

function admin(req){
  return req.headers["x-admin-user"]===ADMIN_USER&&req.headers["x-admin-pass"]===ADMIN_PASS;
}

function customer(req){
  const token=req.headers["x-customer-token"];
  return db.customers.find(c=>c.token===token);
}

app.post("/api/customer/signup",async(req,res)=>{
  const {name,phone,password}=req.body;
  if(!name||!phone||!password)return res.status(400).json({error:"Name, mobile and password required"});
  const p=String(phone).replace(/\D/g,"");
  if(p.length<10)return res.status(400).json({error:"Enter valid mobile number"});
  if(db.customers.some(c=>c.phone===p))return res.status(409).json({error:"Mobile number already registered"});
  const c={id:Date.now(),name:String(name).trim(),phone:p,password:String(password),token:require("crypto").randomBytes(24).toString("hex")};
  db.customers.push(c);
  await save();
  res.json({id:c.id,name:c.name,phone:c.phone,token:c.token});
});

app.post("/api/customer/login",async(req,res)=>{
  const p=String(req.body.phone||"").replace(/\D/g,"");
  const c=db.customers.find(x=>x.phone===p&&x.password===String(req.body.password||""));
  if(!c)return res.status(401).json({error:"Invalid mobile or password"});
  res.json({id:c.id,name:c.name,phone:c.phone,token:c.token});
});

app.get("/api/customer/orders",async(req,res)=>{
  const c=customer(req);
  if(!c)return res.status(401).json({error:"Customer login required"});
  res.json(db.orders.filter(o=>String(o.phone).replace(/\D/g,"")===c.phone));
});

app.get("/api/menu",(req,res)=>res.json(db.menu));
app.get("/api/settings",(req,res)=>res.json(db.settings));

app.get("/api/orders/:id",(req,res)=>{
  const o=db.orders.find(x=>String(x.id)===String(req.params.id));
  if(!o)return res.status(404).json({error:"Order not found"});
  res.json(o);
});

app.post("/api/orders",async(req,res)=>{
  const c=customer(req);
  const {name,phone,address,items,total}=req.body;
  if(!c)return res.status(401).json({error:"Customer login required"});
  if(!name||!phone||!address||!Array.isArray(items)||!items.length)return res.status(400).json({error:"Missing order details"});
  const o={id:Date.now(),name,phone,address,items,total:Number(total)||0,status:"New",date:new Date().toLocaleString("en-IN")};
  db.orders.unshift(o);
  await save();
  res.json(o);
});

app.get("/api/orders",(req,res)=>{
  if(!admin(req))return res.status(401).json({error:"Unauthorized"});
  res.json(db.orders);
});

app.delete("/api/orders/:id",async(req,res)=>{
  if(!admin(req))return res.status(401).json({error:"Unauthorized"});
  const before=db.orders.length;
  db.orders=db.orders.filter(x=>String(x.id)!==String(req.params.id));
  if(db.orders.length===before)return res.status(404).json({error:"Order not found"});
  await save();
  res.json({ok:true});
});

app.patch("/api/orders/:id/status",async(req,res)=>{
  if(!admin(req))return res.status(401).json({error:"Unauthorized"});
  const o=db.orders.find(x=>String(x.id)===String(req.params.id));
  if(!o)return res.status(404).json({error:"Order not found"});
  const s=req.body.status;
  if(!["Accepted","Rejected","Delivered"].includes(s))return res.status(400).json({error:"Invalid status"});
  if(s==="Delivered"&&o.status!=="Accepted")return res.status(400).json({error:"Order must be accepted first"});
  o.status=s;
  await save();
  res.json(o);
});

app.post("/api/admin/login",(req,res)=>{
  if(req.body.user===ADMIN_USER&&req.body.pass===ADMIN_PASS)return res.json({ok:true});
  res.status(401).json({ok:false});
});

app.put("/api/settings",async(req,res)=>{
  if(!admin(req))return res.status(401).json({error:"Unauthorized"});
  db.settings={...db.settings,name:req.body.name||"My Restaurant",logo:typeof req.body.logo==="string"?req.body.logo:db.settings.logo||""};
  await save();
  res.json(db.settings);
});

app.post("/api/menu",async(req,res)=>{
  if(!admin(req))return res.status(401).json({error:"Unauthorized"});
  const x={id:Date.now(),name:req.body.name,price:Number(req.body.price),img:req.body.img};
  if(!x.name||!x.price||!x.img)return res.status(400).json({error:"Name, price and photo required"});
  db.menu.push(x);
  await save();
  res.json(x);
});

app.put("/api/menu/:id",async(req,res)=>{
  if(!admin(req))return res.status(401).json({error:"Unauthorized"});
  const x=db.menu.find(m=>String(m.id)===String(req.params.id));
  if(!x)return res.status(404).json({error:"Food not found"});
  x.name=req.body.name;x.price=Number(req.body.price);x.img=req.body.img;
  await save();
  res.json(x);
});

app.delete("/api/menu/:id",async(req,res)=>{
  if(!admin(req))return res.status(401).json({error:"Unauthorized"});
  db.menu=db.menu.filter(m=>String(m.id)!==String(req.params.id));
  await save();
  res.json({ok:true});
});

app.use(express.static(__dirname));
app.use((req,res)=>res.sendFile(path.join(__dirname,"index.html")));

load().then(()=>app.listen(PORT,()=>console.log("Restaurant server running on "+PORT+" | storage="+(githubEnabled?"github":"local")))).catch(e=>{
  console.error(e);
  process.exit(1);
});
