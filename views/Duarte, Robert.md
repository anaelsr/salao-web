Duarte, Robert
Opa, tudo bem? Tenho um caso onde o cliente quer atualizar o employee via ICS, mas está dando este erro:   📷      Acho que a mensagem de erro quer dizer que ele já existe, pois vi em outro caso que não era de ICS que a mensagem completa era "Principal with lookup type 'companyId,employeeNumber' wi…
Opa, tudo bem? Estou com este caso aqui ainda. Pedi as infos que eles queriam mudar e percebi um misspelling:
 
Cliente: "We are trying to update the userName "userName":"xxxx.xxx@xxx.be", as this has been changed. This is for us the same as the mail of the user xxxx.Rugxxgiero@x.be"}],."
 
Eu: "There is a user in Concur with the employee ID 20044231, whose Login ID and Email Address is listed as xxx.xxxx@xxxx.be (note the spelling: Tomasso instead of Tommaso).
 
It appears the error message is occurring because this employee ID is already associated with xxxx.xxxx@xxx.be in Concur. Could you please check whether the error still occurs if you attempt to update the user with the userName xxxx.Rugxxxgiero@xxxx.be instead?"
 
Eles me informaram que minha observação estava correta, mas a conta que deve ser criada é com o email "xxxx.xxxx@xxxxx.be". No caso querem saber agora se é possível trocar o email antigo pelo novo, pois é o antigo que está errado. O SAP não pode atualizar o email (Login ID) na Concur de um employee ID existente? Pois eu induzi pelo erro que o sistema tentou criar um usuário ao invés de atualizar um existente
 
Me pergunto se então deveria mudar isto direto na Concur, já que é a info de Login ID
 