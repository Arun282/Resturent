const express=require("express");
const cors=require("cors");
const fs=require("fs");
const path=require("path");
const app=express();
const PORT=process.env.PORT||10000;
const DATA=path.join(__dirname,"data.json");
const ADMIN_USER=process.env.ADMIN_USER||"aroh097";
const ADMIN_PASS=process.env.ADMIN_PASS||"Arun@123";
app.use(cors());
app.use(express.json({limit:"8mb"}));
const defaultMenu=[{id:1,name:"Butter Chicken",price:260,img:"https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80"},{id:2,name:"Paneer Tikka",price:220,img:"https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=800&q=80"},{id:3,name:"Veg Biryani",price:180,img:"https://images.unsplash.com/photo-1563379091339-03246963d96c?auto=format&fit=crop&w=800&q=80"},{id:4,name:"Masala Dosa",price:140,img:"https://images.unsplash.com/photo-1630383249896-424e482df921?auto=format&fit=crop&w=800&q=80"}];
let db={menu:defaultMenu,orders:[],settings:{name:"My Restaurant",logo:""}};
try{if(fs.existsSync(DATA))db=JSON.parse(fs.readFileSync(DATA,"utf8"))}catch(e){}
db.settings={name:db.settings?.name||"My Restaurant",logo:db.settings?.logo||""};
function save(){fs.writeFileSync(DATA,JSON.stringify(db))}
function admin(req){return req.headers["x-admin-user"]===ADMIN_USER&&req.headers["x-admin-pass"]===ADMIN_PASS}
app.get("/api/menu",(req,res)=>res.json(db.menu));
app.get("/api/settings",(req,res)=>res.json(db.settings));
app.get("/api/orders/:id",(req,res)=>{const o=db.orders.find(x=>String(x.id)===String(req.params.id));if(!o)return res.status(404).json({error:"Order not found"});res.json(o)});
app.post("/api/orders",(req,res)=>{const {name,phone,address,items,total}=req.body;if(!name||!phone||!address||!Array.isArray(items)||!items.length)return res.status(400).json({error:"Missing order details"});const o={id:Date.now(),name,phone,address,items,total:Number(total)||0,status:"New",date:new Date().toLocaleString("en-IN")};db.orders.unshift(o);save();res.json(o)});
app.get("/api/orders",(req,res)=>{if(!admin(req))return res.status(401).json({error:"Unauthorized"});res.json(db.orders)});
app.patch("/api/orders/:id/status",(req,res)=>{if(!admin(req))return res.status(401).json({error:"Unauthorized"});const o=db.orders.find(x=>String(x.id)===String(req.params.id));if(!o)return res.status(404).json({error:"Order not found"});const s=req.body.status;if(!["Accepted","Rejected","Delivered"].includes(s))return res.status(400).json({error:"Invalid status"});if(s==="Delivered"&&o.status!=="Accepted")return res.status(400).json({error:"Order must be accepted first"});o.status=s;save();res.json(o)});
app.post("/api/admin/login",(req,res)=>{if(req.body.user===ADMIN_USER&&req.body.pass===ADMIN_PASS)return res.json({ok:true});res.status(401).json({ok:false})});
app.put("/api/settings",(req,res)=>{if(!admin(req))return res.status(401).json({error:"Unauthorized"});db.settings={...db.settings,name:req.body.name||"My Restaurant",logo:typeof req.body.logo==="string"?req.body.logo:db.settings.logo||""};save();res.json(db.settings)});
app.post("/api/menu",(req,res)=>{if(!admin(req))return res.status(401).json({error:"Unauthorized"});const x={id:Date.now(),name:req.body.name,price:Number(req.body.price),img:req.body.img};if(!x.name||!x.price||!x.img)return res.status(400).json({error:"Name, price and photo required"});db.menu.push(x);save();res.json(x)});
app.put("/api/menu/:id",(req,res)=>{if(!admin(req))return res.status(401).json({error:"Unauthorized"});const x=db.menu.find(m=>String(m.id)===String(req.params.id));if(!x)return res.status(404).json({error:"Food not found"});x.name=req.body.name;x.price=Number(req.body.price);x.img=req.body.img;save();res.json(x)});
app.delete("/api/menu/:id",(req,res)=>{if(!admin(req))return res.status(401).json({error:"Unauthorized"});db.menu=db.menu.filter(m=>String(m.id)!==String(req.params.id));save();res.json({ok:true})});
app.use(express.static(__dirname));
app.use((req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(PORT,()=>console.log("Restaurant server running on "+PORT));
