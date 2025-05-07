import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AuthState extends ChangeNotifier{
    User? _user;
    bool _isEmailVerified = false;
    bool _hasActiveSubscription = false;

    User? get user => _user;
    bool get isEmailVerified => _isEmailVerified;
    bool get hasActiveSubscription => _hasActiveSubscription;

    void setUser(User? newUser, {bool isEmailVerified = false, bool hasActiveSubscription = false}) {
        _user = newUser;
        if(newUser == null){
            _isEmailVerified = false;
            _hasActiveSubscription = false;
        }else{
            _isEmailVerified = isEmailVerified;
            _hasActiveSubscription = hasActiveSubscription;
        }
        notifyListeners();
    }
}