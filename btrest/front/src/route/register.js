
import { useState } from "react";
import Cookies from 'universal-cookie';

export default function Register(){ 
    
    const [input, setInput] = useState('');
    const [pinput, setpInput] = useState('');
    const [cpinput, setcpInput] = useState('');
        
    const [Wrong,setWrong] = useState(false);
    const [done,setdone] = useState(false);
    const cookies = new Cookies();
    
    const handleClick = async(event, user, pass,secpass) => {
        if (pass !== secpass){
            setWrong("passwords don't match")
            console.log("Efefef")
            return 0 
        }
        console.log("noooo")
        let data = await fetch("http://127.0.0.1:5000/register/user",{
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username:user,
                password:pass
        })}
    )
        data = await data.json()
        console.log(data)
        if (data === '200'){
            setdone("registered sucessfully")
            
        }
        else if (data === 'dup-user'){
            setWrong("username is unavaible")
        }

};

return(

    <div className="flex justify-center p-5 min-w-screen min-h-screen bg-black">
        <div className=" w-9/12 m-5 text-center bg-zinc-800 rounded justify-center content-center p-5">
        <img src="https://seeklogo.com/images/P/pinterest-icon-logo-D4965B6748-seeklogo.com.png" className="-hue-rotate-180 w-14 h-14 content-center drop-shadow-md border-4 border-stone-300 rounded-full"/>
            <h1 className='text-white bold text-3xl sm:text-2xl mb-6 font-mont'>
                Were glad you are here !
            </h1>
            <div className="grid justify-center">
                <input value={input} onInput={e => setInput(e.target.value)} type="text" id="email" className="rounded-md font-normal  m-2 w-64 text-left font-mont p-2" placeholder="myname@example.com"/>
                <input value={pinput} onInput={e => setpInput(e.target.value)} type="password" id="password" className=" font-normal rounded-md m-2 w-64 font-mont p-2 text-left" placeholder="password"/>
                <input value={cpinput} onInput={e => setcpInput(e.target.value)} type="password" id="password" className=" font-normal rounded-md m-2 w-64 font-mont p-2" placeholder="confirm your password"/>
                
                <button onClick={event => handleClick(event, input,pinput,cpinput)} type={"submit"} className="bg-zinc-900 h-12 font-mont text-lg text-white w-64 border rounded-md hover:border-sky-500 m-2"><span>Register</span></button>
                
                {Wrong && <span  className="text-red-500 font-mont">{Wrong}</span>}
                {done && <span  className="text-green-500 font-mont">{done}</span>}

                <div className="text-left px-2">
                    <span>Forgot your password?</span>
                    <a href="https://www.google.com">
                        <span className="m-2 font-mont text-blue-300 font-thin">
                            Click Here
                        </span>
                    </a>

                </div>

                <div className="text-left px-2">
                    <span className="text">logged in?</span>
                    <a href="/login"><span  className="font-thin m-2 font-mont text-blue-300">register</span></a>
                </div>
            </div>
        </div>      
    </div>
);
}
