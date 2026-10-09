import { useState } from "react";
import { useNavigate, Redirect,Route  } from 'react-router-dom';
import Cookies from 'universal-cookie';
export default function Login(){ 
    const [Wrong,setWrong] = useState(false);
    const [input, setInput] = useState('');
    const [pinput, setpInput] = useState('');
    const cookies = new Cookies();
    const handleClick = async(event, email, pass) => {
        console.log(email)
        let data = await fetch("http://127.0.0.1:5000/login",{
            method: 'POST', // or 'PUT'
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username:email,
                password:pass
        })}
    )
    data = await data.json()
    console.log(data);
    let auth = await ( data.auth == 1 );
    if (auth){
            const cookies = new Cookies();
            cookies.set('auth','1')
            cookies.set('user_id',data.user_id)
            cookies.set('username',email) 
            console.log('yep')
            window.location.href = '/';
        }
    else{
        setWrong(true);
        console.log(Wrong)
    }
};

console.log(Wrong)
return(
    <div className="flex justify-center p-5 min-w-screen min-h-screen bg-black">
        <div className=" w-9/12 m-5 text-center bg-zinc-800 rounded justify-center content-center p-5">
        <img src="https://seeklogo.com/images/P/pinterest-icon-logo-D4965B6748-seeklogo.com.png" className="-hue-rotate-180 w-14 h-14 content-center drop-shadow-md border-4 border-stone-300 rounded-full"/>
            <h1 className='text-white bold text-3xl sm:text-2xl mb-6 font-mont'>Welcome to the Behtrest</h1>
            <div className="grid justify-center">
                
                <input value={input} onInput={e => setInput(e.target.value)} type="text" id="email" className="rounded-md m-2 w-64 text-left font-mont p-2" placeholder="myname@example.com"/>
                <input value={pinput} onInput={e => setpInput(e.target.value)} type="password" id="password" className="rounded-md m-2 w-64 text-left font-mont p-2" placeholder="password"/>
                
                <button onClick={event => handleClick(event, input,pinput)} type={"submit"} className="bg-zinc-900 h-12 font-mont text-lg text-white w-64 border rounded-md hover:border-sky-500 m-2" placeholder="login"><span>Login</span></button>
                
                {Wrong && <span  className="text-red-500 font-mont">incorrect</span>}
                
                <div className="text-left px-2">
                    <span>Forgot your password?</span>
                    <a href="https://www.google.com">
                        <span className="m-2 font-mont text-blue-300 font-thin">
                            Click Here
                        </span>
                    </a>

                </div>
                <div className="text-left px-2">
                    <span className="text">Not a user?</span>
                    <a href="/register"><span  className="font-thin m-2 font-mont text-blue-300">register</span></a>
                </div>
            </div>
        </div>      
    </div>
);
}