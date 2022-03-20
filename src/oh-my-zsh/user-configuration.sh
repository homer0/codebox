alias zshconfig="nano ~/.zshrc"
alias reload=". ~/.zshrc && echo 'ZSH config reloaded from ~/.zshrc'"

alias cls="clear"
alias cgst="clear;gst"
alias cgstb="clear;gst;git branch"
alias nu="nvm use"

gdf(){
  git diff -u $1 | diff-so-fancy | less --tabs=4 -RFS --pattern '^(Date|added|deleted|modified): '
}
gpl(){
  git checkout $1; git pull -p; git branch --merged | grep -v \* | grep -v master | grep -v main | xargs -n1 git branch -d
}
