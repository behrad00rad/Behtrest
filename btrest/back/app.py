
from hashlib import sha256
import os,random
from flask import Flask,redirect,request,jsonify,send_file
from cs50 import SQL
from byper import byper
db = SQL("sqlite:///main.db")
from flask_cors import CORS


app=Flask(__name__)
CORS(app, resources={r"*": {"origins": "*"}})
# print(db.execute("UPDATE profile SET pfp = 'http://127.0.0.1:5000/get_image?id=default'"))
# print(db.execute("ALTER TABLE profile ADD saves post_id"))
# print(db.execute("CREATE TABLE profile (user_id INTEGER PRIMARY KEY unique,pfp TEXT,bio TEXT)"))
# print(db.execute('''INSERT INTO profile (pfp,bio) VALUES(?,?)''','http://127.0.0.1:5000/get_image?id=default','seccond'))
# print(db.execute('''DELETE FROM posts'''))
# print(db.execute('''drop table profile'''))
#          
#     VALUES(?,?,?,?,?,?)''',3,"test3 title","test3 caption","/get_image?id=3",2,3))
# print(db.execute('delete from posts '))
# print(db.execute('select * from posts'))


@app.route('/get_home',methods = ["GET"])
def GetHome():
    username = list(request.args)[0]
    data = db.execute("select * from profile where user_id = (select id from users where username == ?)",username)
    return jsonify(data) if data else "404"

@app.route("/ToUser",methods = ["GET"])
def IdUser():
    username = list(request.args)[0]
    data = db.execute("select username from users where id = ?",username)
    return jsonify(data) if data else "404"

@app.route('/profile',methods = ["GET"])
def profile(): 
    id = list(request.args)[0]
    data = db.execute(''' select bio,pfp,username from profile
                          join users on users.id =  profile.user_id
                          where user_id = ?''',id)
    if len(data) >= 1 :
        return jsonify(data)
    else :
        return jsonify("404")

@app.route('/login', methods=['POST'])
def login():
    req = request.json
    us = req.get('username')
    pas = hash(req.get('password'))
    print(pas)
    print(us)
    avv = db.execute("SELECT * FROM users WHERE username=? AND hashed_pass=?",us,pas)
    print(avv)
    if avv:
        return jsonify({"auth":1,'user_id':avv[0]['id']})
    else :
        print('no')
        return jsonify({"auth":0})
 

@app.route('/get_post')
def get_post():
    id = request.args.get('id') 
    data =  db.execute('''SELECT username,title,caption,url,post_id,pfp FROM posts
                          JOIN users ON users.id = posts.user_id
                          JOIN profile ON profile.user_id = users.id
                          WHERE post_id == ?  
                          '''  
                          ,id)

    cms = db.execute('''SELECT username,data,date,pfp FROM comments
                          JOIN users ON users.id = comments.user_id
                          JOIN profile ON profile.user_id = users.id
                          WHERE post_id == ?
                          ORDER BY date ASC;   
                          '''  
                          ,id) 
    print(len(data),(len(cms)))       
    if len(data) > 0 and len(cms) > 0 :
        # print('first')
        return jsonify({"post":data,"c":cms})
    elif len(data) > 0 and len(cms) <= 0 :
        # print('sec')
        return jsonify({"post":data,"c":'404'})
    else: 
        # print('nope')
        return '404'


@app.route('/get_image')
def get_image():
    id = request.args.get('id')    
    filename = f"./images/{id}.jpg" 
    filename2 = f"./images/{id}.png"
    try:
        return send_file(filename2, mimetype='image/gif')
    except FileNotFoundError:
        try:
            return send_file(filename, mimetype='image/gif')
        except FileNotFoundError:
            return '404'


@app.route('/get_feed')
def feed():
    data = db.execute("SELECT * FROM posts")
    # print(data)
    return jsonify({'posts':data})

@app.route("/upload/post",methods=["POST"])
def upload_post():
        id = random.randint(1,100000)
        req = request.form
        file = (request.files['pic'])
        print(req)
        filename = file.filename 
        if filename.endswith('.jpg'):
            file.save(os.path.join('./images',(str(id)+".jpg")))
        if filename.endswith('.png'):
            file.save(os.path.join('./images',(str(id)+".png")))
        # q = db.execute("INSERT INTO posts (title,caption,url,user_id,post_id)",req.title,req.caption,req.user_id,id)
        q = db.execute("INSERT INTO posts (title,caption,url,user_id,post_id) values(?,?,?,?,?)",req.get('title'),req.get('about'),f'/get_image?id={id}',req.get('user_id'),id )        
        while not q :
            id = random.randint(1,100000)
            q = db.execute("INSERT INTO posts (title:title,caption:cap,url:url,user_id:user_id,post_id:id)",title=req.get('title'),cap=req.get('about'),url=f'/get_image?{id}',user_id=req.get('user_id'),id=id )        
            # q = db.execute("INSERT INTO posts (title,caption,url,user_id,post_id)",req.get('title'),req.get('caption'),req.get('user_id'),id)        
        return redirect('http://localhost:3000/') 

@app.route("/upload/comment",methods=['POST'])
def comments():
    json = request.json
    try : 
        data = db.execute('''INSERT INTO comments (data,user_id,post_id,date) VALUES(?,?,?,?)''',json['data'],json['user_id'],json['post_id'],json['date'])
        return '200' if data else "404"
    except Exception:
        return "404"
    # return '1'

@app.route('/register/user',methods= ["POST"])
def register():
    try : 
        json =request.json
        IsDup = db.execute("select username from users where username == ?",json['username'])
        # print(IsDup)
        # print(len(IsDup))
        if len(IsDup) > 0:
            return jsonify('dup-user')
        
        username = json['username']
        password = hash(json['password'])  
        db.execute("insert into users (username,hashed_pass) values(?,?)",username,password)
        db.execute("insert into profile (pfp,bio) values(?,?)","http://http://127.0.0.1:5000/get_image?id=default","")
        return jsonify([{'code': '200'}])
    except Exception:
        return '404'

@staticmethod
def hash(x):
    x = x+"amugus"
    return sha256(x.encode('utf-8')).hexdigest()  


if __name__ == '__main__':
    # print(time.time())
    #DEBUG is SET to TRUE. CHANGE FOR PROD
    app.run(host='0.0.0.0',port=5000,debug=True)

