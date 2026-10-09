import base64
import random
import sys

class byper () : 
    def enbript (data:str):
        tmp = ''
        key = ''
        ran = [chr(random.randint(46,110)) for i in range(len(data))]
        for n,i in enumerate(data):
            newdata = ord(i) ^ ord(ran[n])
            key+= ran[n]
            tmp += (str(newdata+9))
            if not  n >= len(data)-1:
                key += '@'
                tmp += '@'

        return [tmp,key]
    
    
    
    
    
    def debript (data:str,key:str):
        data = data.split('@')
        key = key.split('@')
        newdata = '' 
        for n,i in enumerate(data):
                # print(i)  
                newdata += (chr(int(i)-9 ^ ord(key[n])))
                # print(chr(ord(i)+1 ^ ord(key[n])-1))
                # newdata += chr(ord(i)+1 ^ ord(key[n])-1)
        return newdata

if __name__ == '__main__':
    a = sys.argv[1]
    b = byper.enbript(a)
    print(f'data: {b[0]} k: {b[1]}')
    c = byper.debript(b[0],b[1])
    print(c)