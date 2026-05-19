-- 艺语音乐播放器安装助手
-- 自动处理 macOS 安全限制

on run
    try
        set appPath to "/Applications/艺语音乐播放器.app"
        
        -- 检查应用是否存在
        tell application "Finder"
            if not (exists folder appPath) then
                display dialog "请先将艺语音乐播放器拖拽到 Applications 文件夹中，然后再运行此助手。" with title "安装助手" buttons {"好的"} default button 1 with icon note
                return
            end if
        end tell
        
        -- 显示处理提示
        set userResponse to display dialog "即将优化艺语音乐播放器的系统兼容性。\n\n这将移除 macOS 的安全限制，让应用能够正常运行。" with title "安装助手" buttons {"取消", "继续"} default button 2 with icon note
        
        if button returned of userResponse is "继续" then
            -- 显示进度
            display notification "正在优化应用兼容性..." with title "安装助手"
            
            -- 执行清理命令
            try
                do shell script "xattr -cr '" & appPath & "'" with administrator privileges
                
                -- 成功提示
                display dialog "✅ 艺语音乐播放器已成功优化！\n\n现在您可以正常使用应用了。" with title "优化完成" buttons {"启动应用", "完成"} default button 1 with icon note
                
                if button returned of result is "启动应用" then
                    tell application "艺语音乐播放器" to activate
                end if
                
            on error errMsg
                -- 处理错误
                if errMsg contains "User canceled" then
                    display dialog "操作已取消。\n\n如需手动优化，请在终端执行：\nsudo xattr -cr /Applications/艺语音乐播放器.app" with title "已取消" buttons {"知道了"} default button 1 with icon caution
                else
                    display dialog "优化失败：" & errMsg & "\n\n请尝试手动执行：\nsudo xattr -cr /Applications/艺语音乐播放器.app" with title "需要手动处理" buttons {"知道了"} default button 1 with icon stop
                end if
            end try
        end if
        
    on error errMsg
        display dialog "助手运行出错：" & errMsg with title "错误" buttons {"知道了"} default button 1 with icon stop
    end try
end run

